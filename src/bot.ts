import {
  GameMap,
  GameMapConfig,
  Matrix,
  GameMapLand,
  GameMapPlayer,
  Empty,
  GameMapObject,
  GameTime,
  SoldierData,
  Coords,
  EMPTY,
  SOLDIER1,
  Fog,
  TOWNHALL,
  FOG,
  LAND,
  TOWER1,
  TOWER2,
  FARM,
  isSoldier,
  isTower,
  SOLDIER_LEVELS,
  TOWER_LEVELS,
  SOLDIER4,
  TREE,
  getSoldierLevel,
  Soldier,
  isNotEmptyPlayer,
  PLAYER_SYMBOLS,
  Balance,
  Player,
  EMPTY_PLAYER,
  Time,
  GRAVE,
} from './map'

type LandMap = Matrix<GameMapLand | Fog>
type TeamMap = Matrix<GameMapPlayer | Empty | Fog>
type ObjsMap = Matrix<GameMapObject | Fog>

const EMPTY_OBJECT = 'o'
type UserMapSymbol = GameMapObject | Fog | GameMapLand | typeof EMPTY_OBJECT
type UserMap = Matrix<UserMapSymbol>

class UserWeight {
  constructor(public territory: number, public defense: number, public attack: number, public farming: number) {}
}

type PlayerStats = {
  userMap: UserMap
  move: number
  lastInteraction: number
  averageInteraction: number
}

export default class Bot {
  private timeout?: NodeJS.Timeout

  private LAST_MOVE_WEIGHT: number = 0.87
  private FASTER_THEN_USER: number = 0.87

  private TIMEOUT_MIN: number = 1200
  private TIMEOUT_MAX: number = 6000

  private DEFENSE: number
  private ATTACK: number
  private SOLDIER_WEIGHT: number
  private TOWER_WEIGHT: number

  private now: Time = new Time(0, 0)

  private landMap: LandMap = [[]]
  private teamMap: TeamMap = [[]]
  private objsMap: ObjsMap = [[]]

  private balances: Balance[] = []

  private meOnMap: GameMapPlayer = EMPTY_PLAYER
  private meBalance: Balance

  private soldiers: SoldierData[] = []

  private players_stats: PlayerStats[] = []

  constructor(
    private config: GameMapConfig,
    private players: Player[],
    private makeMove: (from: Coords | null, to: Coords, what: GameMapObject) => void,
    private surrender: () => void
  ) {
    this.meBalance = new Balance(config, null, null, 0)
    for (let i = 0; i < players.length; i++) {
      this.players_stats.push({
        userMap: [[]],
        move: 0,
        lastInteraction: 0,
        averageInteraction: 0,
      })
    }

    const behaviorInitializer = 0.3 + Math.random() * 0.7
    this.DEFENSE = Math.round(behaviorInitializer * 100)
    this.ATTACK = Math.round((1 - behaviorInitializer) * 100)

    const weightInitializer = 0.7 + Math.random() * 0.6
    this.SOLDIER_WEIGHT = Math.round(weightInitializer * 100) / 100
    this.TOWER_WEIGHT = 100 / Math.round(weightInitializer * 100)
  }

  private shuffle<T>(array: T[]) {
    for (let i = array.length - 1; i >= 0; --i) {
      const r = Math.floor(Math.random() * i)
      ;[array[i], array[r]] = [array[r], array[i]]
    }
    return array
  }

  private logMap(landMap: LandMap, teamMap: TeamMap, objsMap: ObjsMap) {
    const format = (y: number, x: number) => {
      const str = objsMap[y][x] != EMPTY ? objsMap[y][x] : landMap[y][x]
      const player = teamMap[y][x]
      return (
        (
          {
            [PLAYER_SYMBOLS[0]]: (s: string) => s.bgGreen,
            [PLAYER_SYMBOLS[1]]: (s: string) => s.bgMagenta,
            [PLAYER_SYMBOLS[2]]: (s: string) => s.bgYellow,
            [PLAYER_SYMBOLS[3]]: (s: string) => s.bgRed,
            [PLAYER_SYMBOLS[4]]: (s: string) => s.bgBlue,
          } as any
        )[player]?.(str) ?? str
      )
    }
    for (let y = 0; y < landMap.length; ++y) {
      const line = landMap[y]
      console.log(
        line.map((c, x) => (x % 2 == 1 ? format(y, x) : '     ')).join('') +
          '\n' +
          '  ' +
          line.map((c, x) => (x % 2 == 0 ? format(y, x) : '     ')).join('') +
          '  '
      )
    }
  }

  private maximumSoldierForBalance<Soldier>(balance: Balance) {
    for (let index = SOLDIER_LEVELS.length - 1; index >= 0; index--) {
      if (SOLDIER_LEVELS[index] == EMPTY) return EMPTY
      if (
        balance.getBalance(this.now.currentTime()) > this.config.economy.prices[SOLDIER_LEVELS[index]] &&
        balance.getIncome() > -this.config.economy.income[SOLDIER_LEVELS[index]]
      ) {
        return SOLDIER_LEVELS[index]
      }
    }
    return EMPTY
  }
  private maximumTowerForBalance<Tower>(balance: Balance) {
    for (let index = TOWER_LEVELS.length - 1; index >= 0; index--) {
      if (TOWER_LEVELS[index] == EMPTY) return EMPTY
      if (
        balance.getBalance(this.now.currentTime()) > this.config.economy.prices[TOWER_LEVELS[index]] &&
        balance.getIncome() > -this.config.economy.income[TOWER_LEVELS[index]]
      ) {
        return TOWER_LEVELS[index]
      }
    }
    return EMPTY
  }

  private getUserMap<UserMap>(player: GameMapPlayer, landMap: LandMap, teamMap: TeamMap, objsMap: ObjsMap) {
    return objsMap.map((line, y) => line.map((el, x) => (player == teamMap[y][x] ? (el != EMPTY ? el : EMPTY_OBJECT) : landMap[y][x])))
  }

  private getCachedUserMap<UserMap>(player: GameMapPlayer) {
    if (player == EMPTY_PLAYER) return
    return this.players_stats[PLAYER_SYMBOLS.indexOf(player)].userMap
  }

  private isUserAction(a: UserMap, b: UserMap) {
    const aCompressed = a
      .map((line) => line.join(''))
      .join('')
      .split('')
    const bCompressed = b
      .map((line) => line.join(''))
      .join('')
      .split('')
    if (aCompressed.length != bCompressed.length) return false // unreachable
    for (let i = 0; i < aCompressed.length; i++) {
      if (aCompressed[i] != bCompressed[i] && (bCompressed[i] != LAND || bCompressed[i] != GRAVE || bCompressed[i] != TREE)) return true
    }

    return false
  }

  private getMaxTowerNear(map: UserMap, y: number, x: number) {
    let max = isTower(map[y][x]) ? GameMap.level(map[y][x]) : 0
    const checkTower = (y: number, x: number) => isTower((map[y] || [])[x]) && GameMap.level(map[y][x]) > max
    const applyMax = (y: number, x: number) => (max = GameMap.level(map[y][x]))

    GameMap.getNeighbours(x, y).forEach((coords) => {
      if (checkTower(coords[0], coords[1])) applyMax(coords[0], coords[1])
    })

    return max
  }

  private calculateUserWeight<UserWeight>(player: GameMapPlayer) {
    const userMap = this.getCachedUserMap(player) || []

    const userMapCompressed = userMap
      .map((line) => line.join(''))
      .join('')
      .split('')
    const territory = userMapCompressed.filter((el) => el != LAND && el != EMPTY && el != FOG).length
    const farming = userMapCompressed.filter((el) => el == FARM).length
    const attack = userMapCompressed
      .filter((el) => isSoldier(el))
      .reduce((acc, sold) => acc + GameMap.level(sold) ** this.SOLDIER_WEIGHT, 0)
    const defense = userMap
      .map((line, y) =>
        line.map((el, x) => (el != EMPTY ? this.getMaxTowerNear(userMap, y, x) ** this.TOWER_WEIGHT : 0)).reduce((acc, tow) => acc + tow)
      )
      .reduce((acc, tow) => acc + tow)

    return new UserWeight(territory, defense, attack, farming)
  }

  private freeSoldierSpaces(player: GameMapPlayer) {
    const userMap = this.getCachedUserMap(player) || []

    return ([] as Coords[]).concat.apply(
      [],
      userMap.map((line, y) =>
        line.reduce((acc: Coords[], obj, x) => {
          if (obj == EMPTY_OBJECT || obj == GRAVE || obj == TREE) acc.push([y, x])
          return acc
        }, [])
      )
    )
  }
  private freeSoldierMoveSpaces(player: GameMapPlayer) {
    const userMap = this.getCachedUserMap(player) || []

    return this.freeSoldierSpaces(player).concat(
      ([] as Coords[]).concat.apply(
        [],
        this.teamMap.map((line, y) =>
          line.reduce((acc, el, x) => {
            const neighbours = GameMap.getNeighbours(y, x).filter(([y, x]) => (this.teamMap[y] || [])[x] == player)
            if (neighbours.length > 0) acc.push([y, x])
            return acc
          }, [] as Coords[])
        )
      )
    )
  }

  private freeBuildingSpaces(player: GameMapPlayer) {
    const userMap = this.getCachedUserMap(player) || []

    return ([] as Coords[]).concat.apply(
      [],
      userMap.map((line, y) =>
        line.reduce((acc: Coords[], obj, x) => {
          if (obj == EMPTY_OBJECT) acc.push([y, x])
          return acc
        }, [])
      )
    )
  }

  private isPointInluded(coords: Coords[], p: Coords) {
    for (const point of coords) {
      if (p[0] == point[0] && p[1] == point[1]) return true
    }
    return false
  }

  private findShortWay(from: Coords, to: Coords) {
    const levels: Coords[][] = [[from]]
    for (let i = 0; levels[i].length > 0; i++) {
      const pastLevel: Coords[] = levels[i]
      levels.push([])
      for (const point of pastLevel) {
        levels[i + 1].push(
          ...GameMap.getNeighbours(point[0], point[1])
            .filter(([y, x]) => (this.landMap[y] || [])[x] == LAND)
            .filter((p) => {
              for (const level of levels) {
                if (this.isPointInluded(level, p)) return false
              }
              return true
            })
        )
      }
      if (this.isPointInluded(levels[i + 1], to)) {
        levels[i + 1] = [to]
        break
      }
    }

    if (levels[levels.length - 1].length == 0) return null

    for (let i = levels.length - 1; i > 1; i--) {
      const pastLevel: Coords[] = levels[i]
      const neighbours: Coords[] = []
      for (const point of pastLevel) {
        neighbours.push(...GameMap.getNeighbours(point[0], point[1]))
      }
      levels[i - 1] = levels[i - 1].filter((p) => this.isPointInluded(neighbours, p))
    }
  }

  private getPlayerSoldiers(player: GameMapPlayer) {
    return this.soldiers.filter((sold) => player == this.teamMap[sold.coords[0]][sold.coords[1]])
  }

  start() {
    const meSoldiers = this.getPlayerSoldiers(this.meOnMap)
    const freeSoldierMoveSpaces = this.freeSoldierMoveSpaces(this.meOnMap)

    if (meSoldiers.length > 0) {
      const selectedSoldier = meSoldiers[Math.round(Math.random() * (meSoldiers.length - 1))]
      const soldierType = this.objsMap[selectedSoldier.coords[0]][selectedSoldier.coords[1]]
      if (soldierType != FOG) {
        this.makeMove(
          selectedSoldier.coords,
          freeSoldierMoveSpaces[Math.round(Math.random() * (freeSoldierMoveSpaces.length - 1))],
          soldierType
        )
      }
    }

    const meWeight = this.calculateUserWeight(this.meOnMap)
    const freeBuildingSpaces = this.freeBuildingSpaces(this.meOnMap)
    if (meWeight.defense / meWeight.territory < 1 && freeBuildingSpaces.length > 3) {
      const tower = this.maximumTowerForBalance(this.meBalance)
      this.makeMove(null, freeBuildingSpaces[0], tower)
    }

    let timeout =
      this.FASTER_THEN_USER * this.players_stats.reduce((acc, stat) => (acc > stat.averageInteraction ? stat.averageInteraction : acc), 0)
    if (timeout > this.TIMEOUT_MAX) timeout = this.TIMEOUT_MAX
    if (timeout < this.TIMEOUT_MIN) timeout = this.TIMEOUT_MIN
    this.timeout = setTimeout(() => this.start(), timeout)
  }

  update(
    now: GameTime,
    landMap: LandMap,
    teamMap: TeamMap,
    objsMap: ObjsMap,
    me: GameMapPlayer,
    balance: Balance,
    soldiers: SoldierData[],
    player_balances: Balance[],
    log: boolean
  ) {
    if (!balance.isValid()) {
      return // we are dead
    }

    this.now = new Time(now, new Date().getTime())

    this.landMap = landMap
    this.teamMap = teamMap
    this.objsMap = objsMap
    this.balances = player_balances

    this.meOnMap = me
    this.meBalance = balance

    this.soldiers = soldiers

    for (let i = 0; i < this.players_stats.length; i++) {
      const userMap = this.getUserMap(this.players[i].symbol, landMap, teamMap, objsMap)
      if (this.isUserAction(userMap, this.players_stats[i].userMap)) {
        const lastmove = this.players_stats[i].move++
        this.players_stats[i].averageInteraction =
          (this.players_stats[i].averageInteraction * lastmove * this.LAST_MOVE_WEIGHT +
            (now - this.players_stats[i].lastInteraction) * (2 - this.LAST_MOVE_WEIGHT)) /
          (lastmove + 1)
        this.players_stats[i].lastInteraction = now
      }
      this.players_stats[i].userMap = userMap
    }

    if (log) {
      console.log(
        'Balance: $' +
          balance +
          '    Income: ' +
          (balance.getIncome() < 0 ? '-' : balance.getIncome() > 0 ? '+' : '~') +
          '$' +
          balance.getIncome()
      )
      this.logMap(landMap, teamMap, objsMap)
    }

    if (!this.timeout) {
      this.timeout = setTimeout(() => this.start(), 0)
    }
  }

  stop() {
    // Bot stops.
    // Clear all timeouts and intervals
    if (this.timeout) {
      clearTimeout(this.timeout)
    }
  }
}
