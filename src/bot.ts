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
} from './map'

const EMPTY_OBJECT = 'o'
type LandMap = Matrix<GameMapLand | Fog>
type TeamMap = Matrix<GameMapPlayer | Empty | Fog>
type ObjsMap = Matrix<GameMapObject | Fog>
type UserMap = Matrix<GameMapObject | Fog | GameMapLand | typeof EMPTY_OBJECT>

class UserWeight {
  constructor(public territory: number, public defense: number, public attack: number, public farming: number) {}
}

export default class Bot {
  private timeout?: NodeJS.Timeout

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

  constructor(
    private config: GameMapConfig,
    private players: Player[],
    private makeMove: (from: Coords | null, to: Coords, what: GameMapObject) => void,
    private surrender: () => void
  ) {
    this.meBalance = new Balance(config, null, null, 0)

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

  private maximumSoldierForBalance<Soldier>(balance: number, income: number) {
    for (let index = SOLDIER_LEVELS.length - 1; index >= 0; index--) {
      if (SOLDIER_LEVELS[index] == EMPTY) return EMPTY
      if (balance > this.config.economy.prices[SOLDIER_LEVELS[index]] && income > -this.config.economy.income[SOLDIER_LEVELS[index]]) {
        return SOLDIER_LEVELS[index]
      }
    }
    return EMPTY
  }
  private maximumTowerForBalance<Tower>(balance: number, income: number) {
    for (let index = TOWER_LEVELS.length - 1; index >= 0; index--) {
      if (TOWER_LEVELS[index] == EMPTY) return EMPTY
      if (balance > this.config.economy.prices[TOWER_LEVELS[index]] && income > -this.config.economy.income[TOWER_LEVELS[index]]) {
        return TOWER_LEVELS[index]
      }
    }
    return EMPTY
  }

  private getUserMap<UserMap>(player: GameMapPlayer, landMap: LandMap, teamMap: TeamMap, objsMap: ObjsMap) {
    return objsMap.map((line, y) => line.map((el, x) => (player == teamMap[y][x] ? (el != EMPTY ? el : EMPTY_OBJECT) : landMap[y][x])))
  }

  private getMaxTowerNear = (map: UserMap, y: number, x: number) => {
    let max = isTower(map[y][x]) ? GameMap.level(map[y][x]) : 0
    const checkTower = (y: number, x: number) => isTower((map[y] || [])[x]) && GameMap.level(map[y][x]) > max
    const applyMax = (y: number, x: number) => (max = GameMap.level(map[y][x]))

    GameMap.getNeighbours(x, y).forEach((coords) => {
      if (checkTower(coords[0], coords[1])) applyMax(coords[0], coords[1])
    })

    return max
  }

  private calculateUserWeight<UserWeight>(player: GameMapPlayer, landMap: LandMap, teamMap: TeamMap, objsMap: ObjsMap) {
    const userMap = this.getUserMap(player, landMap, teamMap, objsMap)
    console.log(userMap.map((c) => c.join('')))

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

  start() {
    // console.log(this.calculateUserWeight('1', landMap, teamMap, objsMap))
    const timeout = this.config.tickDuration / 4
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
      this.timeout = setTimeout(this.start, 0)
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
