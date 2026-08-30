declare module "phe" {
  /** Evaluates 5-7 cards (e.g. ["Ah","Ks","Td","3c","Ad"]) to a strength number. Smaller is better. */
  export function evaluateCards(cards: string[]): number;
  export function evaluateCardCodes(cards: number[]): number;
  export function evaluateCardsFast(cards: string[]): number;
  export function evaluateBoard(cards: string[]): number;
  export function rankCards(cards: string[]): number;
  export function rankCardsFast(cards: string[]): number;
  export function rankCardCodes(cards: number[]): number;
  export function rankBoard(board: string): number;
  export const rankDescription: Record<number, string>;
  export const handRank: Record<string, number>;
}
