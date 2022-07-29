import { GameMap, GameMapConfig, Matrix, GameMapLand, GameMapPlayer, Empty, GameMapObject, GameTime, SoldierData, Coords, EMPTY, SOLDIER1, Fog, TOWNHALL, FOG, LAND, TOWER1, TOWER2, FARM, isSoldier, SOLDIER_LEVELS, SOLDIER4, TREE, getSoldierLevel, Soldier, isNotEmptyPlayer, PLAYER_SYMBOLS } from './map';

type LandMap = Matrix<GameMapLand | Fog>;
type TeamMap = Matrix<GameMapPlayer | Empty | Fog>;
type ObjsMap = Matrix<GameMapObject | Fog>;

export default class Bot {

  constructor(
    private config: GameMapConfig,
    private makeMove: (from: Coords | null, to: Coords, what: GameMapObject) => void,
    private surrender: () => void
  ) {}

  private shuffle<T>(array: T[]) {
    for (let i = array.length - 1; i >= 0; --i) {
      const r = Math.floor(Math.random() * i);
      [array[i], array[r]] = [array[r], array[i]];
    }
    return array;
  }

  private logMap(landMap: LandMap, teamMap: TeamMap, objsMap: ObjsMap) {
    const format = (y: number, x: number) => {
      const str = objsMap[y][x] != EMPTY ? objsMap[y][x] : landMap[y][x];
      const player = teamMap[y][x];
      return ({
        [PLAYER_SYMBOLS[0]]: (s: string) => s.bgGreen,
        [PLAYER_SYMBOLS[1]]: (s: string) => s.bgMagenta,
        [PLAYER_SYMBOLS[2]]: (s: string) => s.bgYellow,
        [PLAYER_SYMBOLS[3]]: (s: string) => s.bgRed,
        [PLAYER_SYMBOLS[4]]: (s: string) => s.bgBlue,
      }as any)[player]?.(str) ?? str; 
    }
    for (let y = 0; y < landMap.length; ++y) {
      const line = landMap[y];
      console.log(
               line.map((c, x) => x % 2 == 1 ? format(y, x) : '     ').join('') + '\n' +
        '  ' + line.map((c, x) => x % 2 == 0 ? format(y, x) : '     ').join('') + '  '
      );
    }
  }

  private timeout?: NodeJS.Timeout;

  update(
    now: GameTime,
    landMap: LandMap,
    teamMap: TeamMap,
    objsMap: ObjsMap,
    me: GameMapPlayer,
    rawBalance: number | null,
    income: number | null,
    soldiers: (readonly [number, number, number])[]
  ) {
    if (rawBalance == null || income == null) {
      return; // we are dead
    }

    const balance = rawBalance / this.config.tickDuration;

    console.log('Balance: $' + balance + '    Income: ' + (income < 0 ? '-' : (income > 0 ? '+' : '')) + '$' + income);
    this.logMap(landMap, teamMap, objsMap);

    // Example of firing next timeout yourself:
    if (this.timeout) {
      clearTimeout(this.timeout);
    }
    const timeout = this.config.tickDuration / 4;
    this.timeout = setTimeout(() => this.update(now + timeout, landMap, teamMap, objsMap, me, rawBalance + income * timeout, income, soldiers), timeout);
  }

  stop() {
    // Bot stops.
    // Clear all timeouts and intervals
  }
}