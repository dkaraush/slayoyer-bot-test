import 'colors'
import io from 'socket.io-client'
import fetch from 'isomorphic-unfetch'
import prompt from 'prompt'
import Bot from './bot'
import { GameMap, GameMapPlayer, Balance, GameMapConfig, SoldierData, Player, PLAYER_SYMBOLS } from './map'

const USERNAME = 'Mi-9'
const TOKEN = '80422f8f0b68a747edb698e78be987f5772ea7a7bd92e1213c989b063f27ddc1e5a12df0e3e1280599c889d83fad8204b2' // just a random string
const MODE = 'random'

const HOSTNAME = 'staging-slayoyer.drpenguin.studio'
const PROTOCOL = 9

let mapConfig: GameMapConfig

prompt.message = ''
prompt.delimiter = ''
prompt.start()
;(async function () {
  const { username, rating, created, playing } = await (
    await fetch(`https://${HOSTNAME}/auth/local?token=${TOKEN}&username=${USERNAME}`)
  ).json()

  console.log(`Logined as ${username} ★ ${rating}`)

  const socket = io(`wss://${HOSTNAME}/?token=${TOKEN}&protocol=${PROTOCOL}&mode=${MODE}&bot`)

  let bot: Bot | undefined

  socket.on('connect', () => {
    console.log('Connected.')

    prompt.get(
      [
        {
          message: 'Press enter to force match start (fill with server bots): ',
        },
      ],
      (err, _) => {
        socket.emit('mm-skip')
      }
    )
  })

  socket.on('mm-status', (count) => console.log(`\nMatchmaking: ${count} players found`))

  socket.on('config', (config, usernames) => {
    mapConfig = config
    console.log('Playing with:')
    for (const p of usernames) {
      if (p) {
        console.log(' - ' + p[0] + ' ★ ' + p[1])
      } else {
        console.log(' - Bot')
      }
    }

    let players: Player[] = []
    usernames.forEach((user: [string, number] | null, id: number) => {
      const isBot = user == null
      players.push({
        symbol: PLAYER_SYMBOLS[id],
        name: isBot ? 'Super server Bot >~<' : user[0],
        rating: isBot ? config.averageRating || 1500 : user[1],
        bot: isBot,
      })
    })

    if (bot) {
      bot.stop()
    }
    bot = new Bot(
      config,
      players,
      (from, to, what) => socket.emit('move', from, to, what),
      () => socket.emit('surrender')
    )
  })

  socket.on(
    'update',
    (
      now: number,
      landMap: string,
      teamMap: string,
      objsMap: string,
      me: string,
      balance: number | null,
      income: number | null,
      soldiers_raw: [number, number, number][],
      player_balances_raw: ([number, number] | null)[]
    ) => {
      let player_balances: Balance[] = []
      player_balances_raw.forEach((bal) => {
        player_balances.push(new Balance(mapConfig, (bal || [bal])[0], (bal || [, bal])[1], now))
      })

      let soldiers: SoldierData[] = []
      soldiers_raw.forEach((sold) => {
        soldiers.push({ coords: [sold[0], sold[1]], cooldownStart: sold[2] })
      })

      if (bot) {
        bot.update(
          now,
          GameMap.toMatrix(landMap),
          GameMap.toMatrix(teamMap),
          GameMap.toMatrix(objsMap),
          me as GameMapPlayer,
          new Balance(mapConfig, balance, income, now),
          soldiers,
          player_balances,
          // false
          Math.round((Math.random() * 3) / 4) == 1
        )
      }
    }
  )

  socket.on('disconnect', () => {
    console.log('Disconnected.')
    if (bot) {
      bot.stop()
      bot = undefined
    }
  })
})()
