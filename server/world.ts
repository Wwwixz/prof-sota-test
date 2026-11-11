export const W = 23, H = 15;
export type Cell = { x: number; y: number };
export type Crystal = Cell & { done: boolean; cracked: boolean; hard: boolean; seed: number; owner?: string };
export type Pickup = Cell & { type: 'oil' | 'med'; seed: number };
export type World = { map: number[][]; start: Cell; exitCell: Cell; crystals: Crystal[]; pickups: Pickup[]; needed: number };
export const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
export function shuffle<T>(values: T[]): T[] {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [result[i], result[j]] = [result[j], result[i]]; }
  return result;
}

// Те же размеры, клеточный автомат и правила размещения, что в исходной игре.
export function generateWorld(depth: number): World {
  let map: number[][] = [], valid = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    map = Array.from({ length: H }, (_, y) => Array.from({ length: W }, (_, x) =>
      x === 0 || y === 0 || x === W - 1 || y === H - 1 || Math.random() < .44 ? 1 : 0));
    for (let pass = 0; pass < 4; pass++) {
      const next = map.map(row => [...row]);
      for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
        let walls = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) walls += map[y + dy][x + dx];
        next[y][x] = walls >= 5 ? 1 : 0;
      }
      map = next;
    }
    const visited = new Set<string>(); let largest: Cell[] = [];
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
      if (map[y][x] || visited.has(`${x},${y}`)) continue;
      const cells = [{ x, y }]; visited.add(`${x},${y}`);
      for (let i = 0; i < cells.length; i++) for (const [dx, dy] of dirs) {
        const nx = cells[i].x + dx, ny = cells[i].y + dy, key = `${nx},${ny}`;
        if (map[ny]?.[nx] !== 0 || visited.has(key)) continue;
        visited.add(key); cells.push({ x: nx, y: ny });
      }
      if (cells.length > largest.length) largest = cells;
    }
    if (largest.length < 55) continue;
    const floor = new Set(largest.map(c => `${c.x},${c.y}`));
    map = map.map((row, y) => row.map((_, x) => floor.has(`${x},${y}`) ? 0 : 1));
    valid = true; break;
  }
  // Гарантированно проходимая страховка при неудаче случайной генерации.
  if (!valid)
    map = Array.from({ length: H }, (_, y) => Array.from({ length: W }, (_, x) => x && y && x < W - 1 && y < H - 1 ? 0 : 1));
  const floors: Cell[] = [];
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) if (!map[y][x]) floors.push({ x, y });
  const start = [...floors].sort((a, b) => Math.abs(a.x - W / 2) + Math.abs(a.y - H / 2) - Math.abs(b.x - W / 2) - Math.abs(b.y - H / 2))[0];
  const distance = Array.from({ length: H }, () => Array(W).fill(-1));
  const queue = [start]; distance[start.y][start.x] = 0;
  for (let i = 0; i < queue.length; i++) for (const [dx, dy] of dirs) {
    const x = queue[i].x + dx, y = queue[i].y + dy;
    if (map[y]?.[x] !== 0 || distance[y][x] !== -1) continue;
    distance[y][x] = distance[queue[i].y][queue[i].x] + 1; queue.push({ x, y });
  }
  const far = [...floors].sort((a, b) => distance[b.y][b.x] - distance[a.y][a.x])[0];
  const needed = Math.min(3 + Math.floor((depth - 1) / 2), 6);
  const candidates = floors.filter(c => distance[c.y][c.x] >= 4 && (c.x !== far.x || c.y !== far.y));
  const picked: Cell[] = [];
  for (const c of shuffle(candidates)) {
    if (picked.length >= needed + 3) break;
    if (picked.every(p => Math.abs(p.x - c.x) + Math.abs(p.y - c.y) >= 3)) picked.push(c);
  }
  for (const c of candidates) { if (picked.length >= needed + 3) break; if (!picked.includes(c)) picked.push(c); }
  const crystals = picked.map((c, i) => ({ ...c, done: false, cracked: false, hard: i > 0 && Math.random() < .34, seed: Math.random() * 100 }));
  const free = shuffle(floors.filter(c => !crystals.some(p => p.x === c.x && p.y === c.y) &&
    (c.x !== start.x || c.y !== start.y) && (c.x !== far.x || c.y !== far.y)));
  const pickups: Pickup[] = free.slice(0, 2 + (depth > 2 ? 1 : 0)).map((c, i) => ({ ...c, type: i % 2 ? 'med' : 'oil', seed: Math.random() * 10 }));
  return { map, start, exitCell: far, crystals, pickups, needed };
}
