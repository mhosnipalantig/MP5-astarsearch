"""
8-Puzzle Solver — A* Search
Flask backend

A* uses f(n) = g(n) + h(n)
  g(n): number of moves from start (path cost)
  h(n): Manhattan distance heuristic

Goal state: [1,2,3,4,5,6,7,8,0]  (0 = blank tile)
"""

import heapq
import random
from flask import Flask, jsonify, request, render_template
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

# ── Constants ──────────────────────────────────────────────────────────────────
GOAL       = (1, 2, 3, 4, 5, 6, 7, 8, 0)
GOAL_INDEX = {v: i for i, v in enumerate(GOAL)}

MOVES = [
    ('Up',    -3),
    ('Down',  +3),
    ('Left',  -1),
    ('Right', +1),
]

# ── Helpers ────────────────────────────────────────────────────────────────────

def manhattan_distance(state):
    dist = 0
    for idx, val in enumerate(state):
        if val == 0:
            continue
        goal_idx = GOAL_INDEX[val]
        dist += abs(idx // 3 - goal_idx // 3) + abs(idx % 3 - goal_idx % 3)
    return dist


def get_neighbors(state):
    blank = state.index(0)
    row, col = divmod(blank, 3)
    neighbors = []
    for direction, delta in MOVES:
        new_blank = blank + delta
        if new_blank < 0 or new_blank > 8:
            continue
        if direction == 'Left'  and col == 0: continue
        if direction == 'Right' and col == 2: continue
        lst = list(state)
        lst[blank], lst[new_blank] = lst[new_blank], lst[blank]
        neighbors.append((tuple(lst), direction))
    return neighbors


def is_solvable(state):
    tiles = [t for t in state if t != 0]
    inversions = sum(
        1
        for i in range(len(tiles))
        for j in range(i + 1, len(tiles))
        if tiles[i] > tiles[j]
    )
    return inversions % 2 == 0


def parse_state(state_str):
    parts = [x.strip() for x in state_str.split(',')]
    if len(parts) != 9:
        raise ValueError(f'Expected 9 values, got {len(parts)}')
    return tuple(int(x) for x in parts)


# ── A* Search ─────────────────────────────────────────────────────────────────

def astar(start):
    h_start = manhattan_distance(start)
    heap = [(h_start, 0, start, [start], [])]
    visited_order = []
    closed = set()

    while heap:
        f, g, state, path_states, path_moves = heapq.heappop(heap)

        if state in closed:
            continue
        closed.add(state)
        visited_order.append(state)

        if state == GOAL:
            return {
                'solved':  True,
                'path':    [list(s) for s in path_states],
                'moves':   [{'dir': d} for d in path_moves],
                'visited': [list(s) for s in visited_order],
                'stats': {
                    'visited_count': len(visited_order),
                    'path_length':   len(path_moves),
                },
            }

        for next_state, direction in get_neighbors(state):
            if next_state not in closed:
                g_new = g + 1
                h_new = manhattan_distance(next_state)
                f_new = g_new + h_new
                heapq.heappush(heap, (
                    f_new, g_new, next_state,
                    path_states + [next_state],
                    path_moves  + [direction],
                ))

    return {'solved': False, 'path': [], 'moves': [], 'visited': [], 'stats': {}}


# ── Flask Routes ───────────────────────────────────────────────────────────────

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/new-puzzle')
def new_puzzle():
    tiles = list(range(9))
    while True:
        random.shuffle(tiles)
        state = tuple(tiles)
        if is_solvable(state):
            break
    h = manhattan_distance(state)
    return jsonify({'state': list(state), 'heuristic': h})


@app.route('/api/solve')
def solve():
    state_str = request.args.get('state', '')
    if not state_str:
        return jsonify({'error': 'Missing ?state= parameter'}), 400
    try:
        state = parse_state(state_str)
    except ValueError as e:
        return jsonify({'error': str(e)}), 400
    if not is_solvable(state):
        return jsonify({'solved': False, 'error': 'puzzle is not solvable'})
    return jsonify(astar(state))


@app.route('/api/heuristic')
def heuristic():
    state_str = request.args.get('state', '')
    if not state_str:
        return jsonify({'error': 'Missing ?state= parameter'}), 400
    try:
        state = parse_state(state_str)
    except ValueError as e:
        return jsonify({'error': str(e)}), 400
    return jsonify({'heuristic': manhattan_distance(state)})


if __name__ == '__main__':
    print("=" * 55)
    print("  8-Puzzle A* Solver — Flask server")
    print("  http://127.0.0.1:5000")
    print("=" * 55)
    app.run(debug=True, port=5000)
