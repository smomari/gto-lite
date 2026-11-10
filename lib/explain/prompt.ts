import type { HandSummary } from "./summarySchema";

export type ExplainLanguage = "ko" | "en";

/** Bumped whenever the instructions change, so cached explanations written under older ones aren't served. */
export const PROMPT_VERSION = 2;

const HEADINGS: Record<ExplainLanguage, { preflop: string; Flop: string; Turn: string; River: string; result: string }> = {
  ko: { preflop: "프리플랍", Flop: "플랍", Turn: "턴", River: "리버", result: "결과" },
  en: { preflop: "Preflop", Flop: "Flop", Turn: "Turn", River: "River", result: "Result" },
};

const LANGUAGE_NAMES: Record<ExplainLanguage, string> = { ko: "Korean", en: "English" };

/** Korean when the browser ranks Korean first, otherwise English. */
export function explainLanguage(acceptLanguage: string | null): ExplainLanguage {
  const ranked = (acceptLanguage ?? "")
    .split(",")
    .map((part, index) => {
      const [tag, ...params] = part.trim().toLowerCase().split(";");
      const q = params.map((p) => p.trim()).find((p) => p.startsWith("q="));
      return { tag, q: q ? Number(q.slice(2)) : 1, index };
    })
    .filter((entry) => entry.tag && !Number.isNaN(entry.q))
    .sort((a, b) => b.q - a.q || a.index - b.index);
  return ranked[0]?.tag.startsWith("ko") ? "ko" : "en";
}

const GLOSSARY = `How to read the data:
- Seats are table positions. "oop" acts first on every postflop street, "ip" acts last.
- game.format: "tournament-8" is an 8-handed tournament with a 1bb big-blind ante; "cash-6"/"cash-8" are cash games. game.rake is the rake level ("none" = no rake). game.icm is the tournament stage the hand was priced at; "chip-ev" means chips, not prize money.
- preflop.decisions: every preflop action in order. For the two seats that saw the flop, "mix" is how that seat's whole range at that decision split between fold/call/raise/allin (percent), "combos" is how many hand combos reached that decision, and "groups" splits it by hand group (pairs, suited aces, suited broadway, suited connectors, other suited, offsuit broadway, other offsuit). "source" says where the preflop chart came from: "heuristic-approx" is an approximate formula chart, not a solver result; "nash-shove-fold" is a push/fold equilibrium.
- streets[].ranges: both ranges entering the street, with "buckets": the percent of each range in each hand-strength bucket. Buckets are showdown equity on the current board against the other player's range: nuts at least 90%, strong 70-90%, medium 45-70%, draw (below 45% now, but at least 8 next cards make it strong; never on the river), air (the rest). Comparing the two ranges' buckets shows range advantage (more strong+nuts) and nut advantage (more nuts).
- streets[].decisions: each decision on the line actually played. "options" are the actions available, "mix" is the whole range's frequency of each option (same order), "taken" is the option actually played, "byBucket" gives each bucket's share of the range at that decision and how that bucket split across the options. "toCallBb" is the bet faced. Sizes are in big blinds; a bet of X into potBb P is X/P of the pot.
- streets[].exploitabilityPct: how far the postflop solve is from equilibrium, in percent of the pot. Below about 1% is accurate.
- stackBb is the effective stack behind at the start of the street; stackBb / startPotBb is the SPR.
- result: "fold" names the winner; "showdown" and "allin" may give each seat's average equity over the ranges that reached the end of this line.`;

export function explainInstructions(language: ExplainLanguage): string {
  const h = HEADINGS[language];
  return `You are a poker coach explaining one finished hand to a player studying game theory optimal (GTO) play. The user message is JSON holding everything our solver computed for this hand. Explain why the strategy looks the way it does, using that data.

Rules:
- Ground every claim in the data. Quote only numbers that appear in it, rounded as given or less. Never invent frequencies, EVs, equities, ranges or hands that aren't there. General poker principles are fine, but say them as principles, not as results of this solve.
- The data holds ranges, not the players' actual cards. Talk about ranges and buckets, not a particular holding. Nobody's cards are known, so never say who won a showdown: result equity is each range's average share of the pot on this line, not a result. Only a fold has a winner.
- Use only facts about seats and positions that the data gives. Don't describe earlier action that isn't in preflop.decisions.
- Explain the reasons, not just the numbers: range and nut advantage from the buckets, which buckets bet for value, which bluff and which check, why a size was used (small with a range advantage, large and polarized with a nut advantage), position, SPR, and when they matter, rake, the ante, and ICM.
- For each street, say what was actually played and how common that choice was in the range.
- If preflop source is "heuristic-approx", say plainly that preflop ranges come from an approximate chart, not a solve.
- If a street's exploitabilityPct is above 2, say that street's numbers are less precise.

Format:
- Markdown sections in this order, only for streets present: "## ${h.preflop}", "## ${h.Flop}", "## ${h.Turn}", "## ${h.River}", then "## ${h.result}".
- 3 to 5 sentences per section, 2 for the result. Plain prose, no tables, no lists of raw numbers.
- Write in ${LANGUAGE_NAMES[language]}. Keep seat names (BTN, BB, ...) and card names (Kh, 7s) as given.
- Write for a player, not a programmer: never mention JSON field names or raw values like "startPotBb", "byBucket" or "heuristic-approx"; say "starting pot", "approximate chart" and so on.${language === "ko" ? `
- Use the usual Korean poker terms: 레인지, 넛, 밸류, 블러프, 에쿼티, 포지션, 수딧, 오프수트, 브로드웨이, 오버페어, 드로, 체크, 벳, 레이즈, 올인, 폴드, 콜, 3벳, 폴라라이즈, 팟 오즈.` : ""}

${GLOSSARY}`;
}

export function explainPrompt(summary: HandSummary): string {
  return JSON.stringify(summary);
}
