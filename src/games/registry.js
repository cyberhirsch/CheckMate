// Game registry. Every game module implements the same contract:
//
//   meta = {
//     id,            // short slug used in links (t= param) and storage
//     title,         // display name
//     glyph,         // one character for the picker card
//     players,       // { w: "White", b: "Black" } display names
//     rotatable,     // true when board orientation is meaningful (chess-likes)
//     moveRe,        // RegExp validating one move token
//   }
//
//   createEngine(tokens, { gameId }) -> engine | null (null = some token illegal)
//     engine.tokens        applied history (array of tokens)
//     engine.turn()        "w" | "b" (side to move)
//     engine.status()      { result: "active"|"win"|"draw", winner, note? }
//     engine.apply(token)  boolean, mutates
//     engine.legalMoves()  array of tokens
//     engine.describe(t)   short history label for token
//
//   createView(container) -> view
//     view.render(engine, { selection, lastMove, orientation, interactive })
//     view.onTap(cb)       cb(cellId) — cellId is a game-defined string
//
//   tapReducer(engine, selection, cellId) ->
//     { kind: "move", token }
//     { kind: "select", selection }        selection is game-defined, passed back on next tap
//     { kind: "choose", options, build }   options: [{value,label,glyph}], build(value) -> token
//     { kind: "none" }

import * as chess from "./chess.js";
import * as connect4 from "./connect4.js";
import * as tictactoe from "./tictactoe.js";
import * as ultimate from "./ultimate.js";
import * as reversi from "./reversi.js";
import * as checkers from "./checkers.js";
import * as gomoku from "./gomoku.js";
import * as hex from "./hex.js";
import * as morris from "./morris.js";
import * as dots from "./dots.js";
import * as mancala from "./mancala.js";
import * as breakthrough from "./breakthrough.js";
import * as ur from "./ur.js";

const MODULES = [chess, connect4, tictactoe, ultimate, reversi, checkers, gomoku, hex, morris, dots, mancala, breakthrough, ur];

export const GAMES = {};
for (const mod of MODULES) GAMES[mod.meta.id] = mod;

export const GAME_ORDER = MODULES.map((m) => m.meta.id);

export function gameModule(id) {
  return GAMES[id] || null;
}
