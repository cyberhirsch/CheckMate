import { Chess } from "https://esm.sh/chess.js@1.0.0-beta.8";

export function createGame(fen) {
  return fen ? new Chess(fen) : new Chess();
}

export function statusOf(game) {
  if (game.isCheckmate()) return { result: "checkmate", winner: game.turn() === "w" ? "black" : "white" };
  if (game.isStalemate()) return { result: "stalemate", winner: null };
  if (game.isThreefoldRepetition()) return { result: "threefold-repetition", winner: null };
  if (game.isInsufficientMaterial()) return { result: "insufficient-material", winner: null };
  if (game.isDraw()) return { result: "draw", winner: null };
  if (game.isCheck()) return { result: "check", winner: null };
  return { result: "active", winner: null };
}

export function legalMovesFrom(game, square) {
  return game.moves({ square, verbose: true });
}
