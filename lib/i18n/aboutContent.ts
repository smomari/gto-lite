import { BET_SIZING } from "@/lib/postflopSolver/betAbstraction";
import { ALLIN_OPEN_MAX_SPR } from "@/lib/postflopSolver/flopSizing";
import type { Locale } from "./messages";

export interface AboutSection {
  /** The anchor other pages link to, e.g. /about#preflop. */
  id: string;
  heading: string;
  paragraphs?: string[];
  items?: string[];
  /** Numbered steps rather than bullets. */
  ordered?: boolean;
}

export interface AboutContent {
  title: string;
  lead: string;
  sections: AboutSection[];
  feedbackLink: string;
  openSolver: string;
}

/**
 * The About page's text. Its figures come from the project's own
 * measurements (scripts/accuracy-postflop.ts, the reference-range tests) and
 * the limits from the solver's code: when either changes, this changes.
 */
const en: AboutContent = {
  title: "About gtoLite",
  lead: "A free poker study tool. It shows preflop ranges for tournaments and cash games, and solves postflop spots between two players right in your browser. No sign-up.",
  sections: [
    {
      id: "how-to",
      heading: "How to use it",
      ordered: true,
      items: [
        "Pick the game in Settings: tournament or cash, the stack, and for tournaments an ICM stage.",
        "Play the hand forward by clicking an action under each seat. The chart shows the range of the seat to act: how often each hand folds, calls, raises or goes all-in.",
        "When two players are left, pick a flop. The solver works out both players' strategies, and you continue through the turn and river the same way.",
        "Use Share to copy a link to the exact spot on screen.",
      ],
    },
    {
      id: "preflop",
      heading: "How preflop ranges are made",
      paragraphs: [
        "Most preflop ranges are labelled Estimated. They are not solved on the spot: they come from range charts and rules tuned so their overall frequencies match solver output at 20, 40 and 100 big blinds, with stacks in between blended from those.",
        "At 15 big blinds or less, and whenever the stacks are short against the pot, ranges are labelled Nash: an all-in-or-fold game solved exactly for the stack, the ante and the rake.",
        "With an ICM stage chosen, tournament ranges are priced in prize money instead of chips, for a 1,000-player field paying 150 with every stack equal.",
      ],
    },
    {
      id: "postflop",
      heading: "How postflop is solved",
      paragraphs: [
        "Postflop is a real solve, not a lookup. A CFR solver compiled to WebAssembly runs on your device, starting from the two ranges that reached the flop, and stops when neither player can gain more than 0.5% of the pot by changing strategy on the tree it solved.",
        "To finish in seconds, the flop solve looks ahead to a sample of turn and river cards with a smaller betting menu, and each street is solved again in full once its card is known. Fast flop looks at fewer cards: quicker and less accurate.",
      ],
    },
    {
      id: "accuracy",
      heading: "How accurate it is",
      paragraphs: [
        "Postflop: measured against a solve of the complete tree with the same bet sizes, the default flop solve gives up about 1.7% of the pot on average (0.8% to 2.8% across the test boards). Fast flop gives up about 5%.",
        "Preflop: hand by hand against public solver ranges, opening ranges agree on 87–94% of hands, ranges facing an open on 85–89%, and ranges facing a 3-bet on 73–75%. Spots the charts were tuned on are within about 3 percentage points of solver frequencies; others can be further off.",
        "Read the output as a strong starting point for study, not as the last word of a full solver.",
      ],
    },
    {
      id: "limits",
      heading: "What it doesn't do",
      items: [
        "Postflop is heads-up only. Pots with three or more players stop at the flop.",
        "Bet sizes come from a short menu. On the flop a quick first pass picks the two that fit the spot for each player, out of {flopSizes} of the pot; a player who rarely bets there gets one. Later streets use {laterSizes}. All-in is always among the raises, and among the bets on the turn and river or when the stack is at most {allinPots} pots.",
        "Only one raise per street. A raise can be called or folded to, not re-raised.",
        "Short stacks shove or fold. There is no limp or min-raise at 15 big blinds or less, so those ranges shove wider than a solver that mixes them.",
        "Everyone at the table has the same stack.",
        "Cash-game charts and the effect of rake on preflop ranges are estimates.",
      ],
    },
    {
      id: "ai",
      heading: "AI explanation",
      paragraphs: [
        "When a hand ends, an AI model can explain it in plain words from the solver's numbers for that hand. It is limited to 3 explanations a day per person, and the same line again is free. The explanation can misread the numbers or be wrong: the charts are the source.",
      ],
    },
    {
      id: "privacy",
      heading: "Privacy",
      paragraphs: [
        "There are no accounts. Your settings and language stay in your browser. Preflop requests carry only the game settings and the actions; postflop solving happens on your device. Visits are counted without cookies. The AI explanation's daily limit uses a random ID cookie and a scrambled form of your IP address.",
      ],
    },
    {
      id: "disclaimer",
      heading: "Good to know",
      paragraphs: [
        "gtoLite is an independent project for study. It is not affiliated with any poker site or solver company. Check your poker site's rules before using any tool while you play.",
      ],
    },
    {
      id: "feedback",
      heading: "Feedback",
      paragraphs: ["Found a range that looks wrong, or a bug? Open an issue on GitHub with the link to the spot."],
    },
  ],
  feedbackLink: "Open an issue on GitHub",
  openSolver: "Open the solver",
};

const ko: AboutContent = {
  title: "gtoLite 소개",
  lead: "무료 포커 학습 도구입니다. 토너먼트와 캐시 게임의 프리플랍 레인지를 보여 주고, 두 명이 남은 포스트플랍 스팟을 브라우저 안에서 바로 풉니다. 가입은 필요 없습니다.",
  sections: [
    {
      id: "how-to",
      heading: "쓰는 법",
      ordered: true,
      items: [
        "설정에서 게임을 고릅니다: 토너먼트 또는 캐시, 스택, 토너먼트라면 ICM 단계.",
        "각 좌석 아래의 액션을 눌러 핸드를 진행합니다. 표에는 지금 차례인 좌석의 레인지가 나옵니다. 핸드마다 폴드, 콜, 레이즈, 올인을 얼마나 하는지 보여 줍니다.",
        "두 명이 남으면 플랍 카드를 고릅니다. 솔버가 두 플레이어의 전략을 계산하고, 턴과 리버도 같은 방식으로 이어 갑니다.",
        "공유를 누르면 지금 화면의 스팟으로 바로 가는 링크가 복사됩니다.",
      ],
    },
    {
      id: "preflop",
      heading: "프리플랍 레인지를 만드는 방식",
      paragraphs: [
        "프리플랍 레인지는 대부분 '추정'으로 표시됩니다. 그 자리에서 푼 값이 아닙니다. 레인지 차트와 규칙을 20, 40, 100bb에서 솔버 결과의 전체 빈도에 맞춰 조정했고, 그 사이 스택은 이 값들을 섞어서 만듭니다.",
        "15bb 이하이거나 팟에 비해 스택이 얕으면 '내시'로 표시됩니다. 올인 아니면 폴드인 게임을 스택, 앤티, 레이크에 맞춰 정확히 푼 값입니다.",
        "ICM 단계를 고르면 토너먼트 레인지를 칩이 아니라 상금 기준으로 계산합니다. 1,000명 참가, 150명 입상, 모든 스택이 같다는 가정입니다.",
      ],
    },
    {
      id: "postflop",
      heading: "포스트플랍을 푸는 방식",
      paragraphs: [
        "포스트플랍은 미리 만든 표를 찾는 것이 아니라 실제로 풉니다. WebAssembly로 만든 CFR 솔버가 사용자의 기기에서 돌며, 플랍까지 온 두 레인지에서 시작합니다. 푼 트리에서 어느 쪽도 전략을 바꿔 팟의 0.5% 넘게 더 얻을 수 없게 되면 멈춥니다.",
        "몇 초 안에 끝내기 위해 플랍 솔브는 턴과 리버 카드 일부를 줄인 베팅 메뉴로 내다보고, 카드가 정해지면 그 스트리트를 원래 메뉴로 다시 풉니다. '빠른 플랍'은 카드를 더 적게 봅니다. 더 빠르지만 덜 정확합니다.",
      ],
    },
    {
      id: "accuracy",
      heading: "정확도",
      paragraphs: [
        "포스트플랍: 같은 벳 사이즈로 트리 전체를 푼 결과와 비교하면, 기본 플랍 솔브의 손실은 평균 팟의 약 1.7%입니다(테스트 보드에 따라 0.8~2.8%). 빠른 플랍은 약 5%입니다.",
        "프리플랍: 공개된 솔버 레인지와 핸드별로 비교하면 오픈 레인지는 87~94%, 오픈에 대응하는 레인지는 85~89%, 3벳에 대응하는 레인지는 73~75%의 핸드가 일치합니다. 차트를 맞춘 스팟은 솔버 빈도와 약 3%p 안에 들어오고, 그 밖의 스팟은 더 벗어날 수 있습니다.",
        "완전한 솔버의 최종 답이 아니라, 공부를 시작하기 좋은 기준으로 읽어 주세요.",
      ],
    },
    {
      id: "limits",
      heading: "하지 못하는 것",
      items: [
        "포스트플랍은 2명일 때만 풉니다. 3명 이상이 남은 팟은 플랍에서 멈춥니다.",
        "벳 사이즈는 짧은 메뉴에서 나옵니다. 플랍은 먼저 빠르게 한 번 풀어서 팟의 {flopSizes} 가운데 그 스팟에 맞는 두 가지를 플레이어마다 고릅니다. 거기서 거의 벳하지 않는 쪽은 하나만 받습니다. 이후 스트리트는 {laterSizes}를 씁니다. 올인은 레이즈에는 항상 있고, 벳에는 턴과 리버에서, 또는 스택이 팟의 {allinPots}배 이하일 때 있습니다.",
        "스트리트마다 레이즈는 한 번입니다. 레이즈에는 콜이나 폴드만 할 수 있고 다시 레이즈할 수 없습니다.",
        "짧은 스택은 올인 아니면 폴드입니다. 15bb 이하에는 림프와 민레이즈가 없어서, 이를 섞는 솔버보다 올인 범위가 넓습니다.",
        "테이블의 모든 플레이어가 같은 스택을 갖습니다.",
        "캐시 게임 차트와, 레이크가 프리플랍 레인지에 주는 영향은 추정치입니다.",
      ],
    },
    {
      id: "ai",
      heading: "AI 설명",
      paragraphs: [
        "핸드가 끝나면 AI 모델이 그 핸드의 솔버 수치를 바탕으로 쉬운 말로 설명해 줍니다. 한 사람당 하루 3회까지이고, 같은 라인을 다시 보는 것은 무료입니다. 설명은 수치를 잘못 읽거나 틀릴 수 있습니다. 기준은 표의 수치입니다.",
      ],
    },
    {
      id: "privacy",
      heading: "개인정보",
      paragraphs: [
        "계정이 없습니다. 설정과 언어는 브라우저에만 저장됩니다. 프리플랍 요청에는 게임 설정과 액션만 담기고, 포스트플랍 계산은 사용자의 기기에서 이뤄집니다. 방문 수는 쿠키 없이 집계합니다. AI 설명의 하루 한도에는 무작위 ID 쿠키와, 알아볼 수 없게 변환한 IP 주소를 씁니다.",
      ],
    },
    {
      id: "disclaimer",
      heading: "알아 둘 점",
      paragraphs: [
        "gtoLite는 학습을 위한 개인 프로젝트입니다. 어떤 포커 사이트나 솔버 회사와도 관계가 없습니다. 플레이 중에 도구를 쓰기 전에 이용하는 포커 사이트의 규정을 확인하세요.",
      ],
    },
    {
      id: "feedback",
      heading: "피드백",
      paragraphs: ["이상해 보이는 레인지나 버그를 찾으셨나요? 그 스팟의 링크와 함께 GitHub에 이슈를 남겨 주세요."],
    },
  ],
  feedbackLink: "GitHub에 이슈 남기기",
  openSolver: "솔버 열기",
};

const CONTENT: Record<Locale, AboutContent> = { en, ko };

/** "33%, 50% or 100%": the solver's own menu, so the page can't drift from it. */
function sizeList(fractions: number[], locale: Locale): string {
  const sizes = fractions.map((fraction) => `${Math.round(fraction * 100)}%`);
  if (locale === "ko" || sizes.length < 2) return sizes.join(", ");
  return `${sizes.slice(0, -1).join(", ")} or ${sizes[sizes.length - 1]}`;
}

export function aboutContent(locale: Locale): AboutContent {
  const content = CONTENT[locale];
  const fill = (text: string) =>
    text
      .replace("{flopSizes}", sizeList(BET_SIZING.flop.betPotFractions, locale))
      .replace("{laterSizes}", sizeList(BET_SIZING.turn.betPotFractions, locale))
      .replace("{allinPots}", String(ALLIN_OPEN_MAX_SPR));
  return { ...content, sections: content.sections.map((section) => ({ ...section, items: section.items?.map(fill) })) };
}
