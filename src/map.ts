// SERVER CODE WITH TYPES AND STATIC METHODS
// DO NOT CHANGE

import 'colors'

export type Matrix<V> = V[][]
export type Coords = [/* y */ number, /* x */ number]
export type CoordsSymbol<T extends string = string> = [/* y */ number, /* x */ number, /* map symbol */ T]

export const FOG = '*' as const
export type Fog = typeof FOG

export const EMPTY = '.' as const
export type Empty = typeof EMPTY

export const LAND = '#' as const
export type Land = typeof LAND

export type GameMapLand = Empty | Land

export const EMPTY_PLAYER = '0'
export const PLAYER_SYMBOLS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'A', 'B', 'C', 'D', 'E', 'F'] as const
export const isPlayer = (s: any): s is GameMapPlayer => s == EMPTY_PLAYER || PLAYER_SYMBOLS.includes(s)
export const isNotEmptyPlayer = (s: any): s is typeof PLAYER_SYMBOLS[number] => isPlayer(s) && s != EMPTY_PLAYER
export type GameMapPlayer = typeof EMPTY_PLAYER | typeof PLAYER_SYMBOLS[number]

export type Player = { symbol: GameMapPlayer; name: string; rating: number; bot: boolean }

export const TOWNHALL = '&' as const
export type TownHall = typeof TOWNHALL

export const TREE = '↑' as const
export const isTree = (s: any): s is Tree => s == TREE
export type Tree = typeof TREE

export const GRAVE = '✞' as const
export type Grave = typeof GRAVE

export const SOLDIER1 = '1' as const
export const SOLDIER2 = '2' as const
export const SOLDIER3 = '3' as const
export const SOLDIER4 = '4' as const
export const SOLDIER_LEVELS = [EMPTY, SOLDIER1, SOLDIER2, SOLDIER3, SOLDIER4] as const
export const getSoldierLevel = (s: any): number => SOLDIER_LEVELS.indexOf(s)
export const isSoldier = (s: any): s is Soldier => s == SOLDIER1 || s == SOLDIER2 || s == SOLDIER3 || s == SOLDIER4
export type Soldier = typeof SOLDIER1 | typeof SOLDIER2 | typeof SOLDIER3 | typeof SOLDIER4

export const FARM = '$' as const
export const isFarm = (s: any): s is Farm => s == FARM
export type Farm = typeof FARM

export const TOWER1 = '|' as const
export const TOWER2 = '‖' as const
export const TOWER_LEVELS = [EMPTY, EMPTY, TOWER1, TOWER2] as const
export const isTower = (s: any): s is Tower => s == TOWER1 || s == TOWER2
export type Tower = typeof TOWER1 | typeof TOWER2

export type GameMapObject = Empty | TownHall | Farm | Tower | Soldier | Tree | Grave

export type GameTime = number

export type SoldierData = { coords: Coords; cooldownStart: GameTime }

export class Time {
  constructor(private serverTime: number, private systemTime: number) {}

  public currentTime() {
    return this.serverTime + (this.systemTime - new Date().getTime())
  }
}

export class Balance {
  constructor(private config: GameMapConfig, private rawBalance: number | null, private income: number | null, private setTime: number) {}

  public reset(rawBalance: number, income: number, setTime: number) {
    this.rawBalance = rawBalance
    this.income = income
    this.setTime = setTime
  }

  public isValid() {
    return this.rawBalance != null && this.income != null
  }

  public getBalance(time: number) {
    return ((this.rawBalance || 0) + (this.income || 0) * (time - this.setTime)) / this.config.tickDuration
  }
  public getIncome() {
    return this.income || 0
  }
}

export class GameMap {
  public static DEFAULT_CONFIG = {
    fog: -1,
    startTimeout: 1500,
    tickDuration: 8000, // in ms
    initialBalance: 10,
    maxBalance: 140,
    prepareSoldiers: false,
    economy: {
      income: {
        // per tick
        [TOWNHALL]: +2,
        [LAND]: +1,
        [FARM]: +4,
        [EMPTY]: 0,
        [SOLDIER1]: -1,
        [SOLDIER2]: -6,
        [SOLDIER3]: -18,
        [SOLDIER4]: -36,
        [TOWER1]: -1,
        [TOWER2]: -6,
        [TREE]: -1,
        [GRAVE]: -1,
      },
      prices: {
        farmStart: 12,
        farmStep: +6,
        [EMPTY]: 0,
        [SOLDIER1]: 10,
        [SOLDIER2]: 20,
        [SOLDIER3]: 30,
        [SOLDIER4]: 40,
        [TOWER1]: 15,
        [TOWER2]: 35,
      },
    },
    soldierCooldown: 10000, // in ms
  }

  public static toMatrix<T extends string>(str: string): Matrix<T> {
    return str
      .trim()
      .split('\n')
      .map((line) => line.split('').map((s) => s as T))
  }
  public static reduceMatrix<T extends string, A extends unknown>(
    matrix: Matrix<T>,
    reducer: (acc: A, symbol: T, y: number, x: number) => A,
    initialValue: A
  ): A {
    let value = initialValue
    for (let y = 0; y < matrix.length; ++y) {
      for (let x = 0; x < matrix[y].length; ++x) {
        value = reducer(value, matrix[y][x], y, x)
      }
    }
    return value
  }
  public static filterMatrixCoords<T extends string>(matrix: Matrix<T>, filter: (symbol: T, y: number, x: number) => boolean): Coords[] {
    const coords: Coords[] = []
    for (let y = 0; y < matrix.length; ++y) {
      for (let x = 0; x < matrix[y].length; ++x) {
        if (filter?.(matrix[y][x], y, x)) {
          coords.push([y, x])
        }
      }
    }
    return coords
  }
  public static foreachMatrix<T extends string>(matrix: Matrix<T>, func: (symbol: T, y: number, x: number) => void) {
    if (!matrix) {
      return
    }
    for (let y = 0; y < matrix.length; ++y) {
      for (let x = 0; x < matrix[0].length; ++x) {
        func?.(matrix[y][x], y, x)
      }
    }
  }
  public static mapMatrix<From, To>(matrix: Matrix<From>, func: (symbol: From, y: number, x: number) => To) {
    const newMatrix = GameMap.emptyMatrix<To>(matrix.length, matrix[0]?.length ?? 0)
    for (let y = 0; y < matrix.length; ++y) {
      for (let x = 0; x < matrix[0].length; ++x) {
        newMatrix[y][x] = func(matrix[y][x], y, x)
      }
    }
    return newMatrix
  }
  public static emptyMatrix<T>(height: number, width: number, fillWith: T | Empty = EMPTY): Matrix<T> {
    return [...Array(height)].map(() => [...Array(width)].fill(fillWith))
  }
  public static getNeighbours(y: number, x: number): Coords[] {
    return [
      [y - 1, x],
      [y - (x % 2), x - 1],
      [y - (x % 2), x + 1],
      [y + 1 - (x % 2), x - 1],
      [y + 1 - (x % 2), x + 1],
      [y + 1, x],
    ]
  }
  public static getNeighboursLimited(y: number, x: number, height: number, width: number) {
    return this.getNeighbours(y, x).filter(([ny, nx]) => ny >= 0 && nx >= 0 && ny < height && nx < width)
  }
  public static distance(from: Coords, to: Coords) {
    return Math.max(Math.abs(from[0] - to[0]), Math.abs(from[1] - to[1]), Math.abs(-from[0] - from[1] - (-to[0] - from[0])))
  }
  public static stringMatrix(matrix: Matrix<string>): string {
    return matrix.map((line) => line.join('')).join('\n')
  }

  public static level(object: any) {
    switch (object) {
      case TOWNHALL:
      case SOLDIER1:
        return 1
      case SOLDIER2:
      case TOWER1:
        return 2
      case SOLDIER3:
      case TOWER2:
        return 3
      case SOLDIER4:
        return 4
      default:
        return 0
    }
  }

  private static distMap(landMap: Matrix<GameMapLand>, teamMap: Matrix<GameMapPlayer | Empty>, team: GameMapPlayer, maxDepth?: number) {
    const height = landMap.length
    const width = landMap[0].length
    const matrix = GameMap.emptyMatrix<number>(height, width, Infinity)
    let positions = GameMap.filterMatrixCoords(teamMap, (t) => t === team)
    let depth = 0
    while (positions.length > 0 && depth <= (maxDepth ?? Infinity)) {
      let nextPositions: Coords[] = []
      for (const [y, x] of positions) {
        matrix[y][x] = depth
        nextPositions.push(
          ...GameMap.getNeighbours(y, x).filter(
            ([ny, nx]) =>
              nx >= 0 &&
              ny >= 0 &&
              ny < height &&
              nx < width &&
              !Number.isFinite(matrix[ny][nx]) &&
              !positions.find(([py, px]) => py === ny && px === nx) &&
              !nextPositions.find(([py, px]) => py === ny && px === nx)
          )
        )
      }

      positions = nextPositions
      depth++
    }
    return matrix
  }

  private static placeFog<T>(map: Matrix<T>, distMap: Matrix<number>, distance: number) {
    return GameMap.mapMatrix(map, (cell, y, x) => (distMap[y][x] <= distance ? cell : FOG))
  }
}
export type GameMapConfig = typeof GameMap.DEFAULT_CONFIG

function random<T>(arr: T[]): T | undefined {
  return arr[Math.round(Math.random() * arr.length)]
}
