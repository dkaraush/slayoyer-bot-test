import 'colors';
import io from 'socket.io-client';
import fetch from 'isomorphic-unfetch';
import prompt from 'prompt';
import Bot from './bot';
import { GameMap, GameMapPlayer } from './map';

const USERNAME = 'mybot1';
const TOKEN = 'JAKDn1d1ZXKsdm1dmsAkn32FNDAAKSkdwd1'; // just a random string
const MODE = 'random';

const HOSTNAME = 'staging-slayoyer.drpenguin.studio';
const PROTOCOL = 9;

prompt.message = '';
prompt.delimiter = '';
prompt.start();

(async function () {
  
  const { username, rating, created, playing } = await (await fetch(`https://${HOSTNAME}/auth/local?token=${TOKEN}&username=${USERNAME}`)).json();

  console.log(`Logined as ${username} ★${rating}`);

  const socket = io(`wss://${HOSTNAME}/?token=${TOKEN}&protocol=${PROTOCOL}&mode=${MODE}`);

  let bot: Bot | undefined;

  socket.on('connect', () => {
    console.log('Connected.');

    prompt.get([{
      message: 'Press enter to force match start (fill with server bots): '
    }], (err, _) => {
      socket.emit('mm-skip');
    });
  });

  socket.on('mm-status', count => console.log(`\nMatchmaking: ${count} players found`))

  socket.on('config', (config, usernames) => {
    console.log('Playing with:');
    for (const p of usernames) {
      if (p) {
        console.log(' - ' + p[0] + ' ★' + p[1]);
      } else {
        console.log(' - Bot');
      }
    }

    if (bot) {
      bot.stop();
    }
    bot = new Bot(
      config,
      (from, to, what) => socket.emit('move', from, to, what),
      () => socket.emit('surrender')
    );
  });

  socket.on('update', (
    now: number,
    landMap: string,
    teamMap: string,
    objsMap: string,
    me: string,
    balance: number | null,
    income: number | null,
    soldiers: [number, number, number][]
  ) => {
    if (bot) {
      bot.update(now, GameMap.toMatrix(landMap), GameMap.toMatrix(teamMap), GameMap.toMatrix(objsMap), me as GameMapPlayer, balance, income, soldiers);
    }
  })

  socket.on('disconnect', () => {
    console.log('Disconnected.');
    if (bot) {
      bot.stop();
      bot = undefined;
    }
  });

})();