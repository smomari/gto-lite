# GTO Lite — Preflop Range Viewer

8인 토너먼트 프리플랍 레인지 뷰어. 169개 핸드(13×13 매트릭스)를 그리드로 렌더링하고, 전체
테이블 스택(2~100bb)을 설정한 뒤 각 포지션(UTG, UTG1, LJ, HJ, CO, BTN, SB, BB)의 액션을
순서대로 클릭해서 실제 포커 액션 시퀀스(재오픈 포함)를 만들면, 현재 차례인 포지션의
Fold/Call/Raise/Allin 빈도를 색상 바로 보여준다.

## 개발 서버 실행

```bash
npm run dev
```

[http://localhost:3000](http://localhost:3000) 접속.

## 아키텍처

레인지는 정적 파일이 아니라 **요청마다 서버에서 즉시 계산**된다 (`POST /api/solve`) — 8-max ×
연속 스택(100가지) × 자유로운 액션 시퀀스는 조합이 너무 많아 미리 생성해둘 수 없기 때문.

- `lib/solveEngine/potState.ts` + `rotation.ts` + `replay.ts` — 액션 시퀀스를 실제 포커 규칙
  (재오픈 포함)으로 검증/재생하며 팟/콜금액/다음 차례를 추적.
- `lib/solveEngine/actionSizing.ts` — 레이즈 사이즈 자동 계산(오픈: 앞쪽 포지션 4bb/뒤쪽
  3bb, 리레이즈: 포스트플랍에서 마지막 공격자보다 뒤에 행동(IP)하면 이전 베팅의 3배, 앞(OOP)이면 4배
  — SB·BB는 항상 OOP 쪽).
- `lib/solveEngine/classify.ts` — 스택이 얕거나(≤25bb) 팟 대비 남은 스택이 적으면 Nash
  push/fold 솔버(`lib/nashSolver/pushFoldSolver.ts`)로, 아니면 근사 레인지 엔진
  (`lib/heuristicRanges/`)으로 라우팅.
- `lib/equity/loadEquityMatrix.ts` — 169×169 all-in equity 매트릭스(오프라인 생성, 커밋됨)를
  읽어 위 두 엔진에 공급.

앤티는 BB가 1bb를 추가로 내는 방식(BB 앤티)으로 계산한다. Chip-EV만 반영(ICM 제외).

## Equity 매트릭스 재생성

```bash
npm run generate:equity   # 169x169 all-in equity 매트릭스 (data/equity/, 커밋됨)
```

## C++/WASM 솔버 빌드

포스트플랍 솔버의 계산 핵심은 C++(`native/solver/`)로 작성하고, Emscripten으로 WASM(SIMD)으로
빌드한다. 트리 구성·핸드 평가·UI는 TypeScript. 빌드 산출물(`lib/postflopSolver/wasm/solver.*.mjs`,
wasm이 내장된 단일 파일 ES 모듈, 브라우저·Node × 1스레드·pthread 4종)은 **커밋한다** — Vercel 빌드에는 Emscripten이 없기 때문. 그래서
C++ 소스를 고치지 않는 한 Emscripten 없이도 개발·빌드·테스트가 된다.

C++을 고칠 때만 Emscripten이 필요하다(버전은 `native/EMSDK_VERSION`에 고정):

```bash
git clone https://github.com/emscripten-core/emsdk.git ~/emsdk
cd ~/emsdk && ./emsdk install 6.0.13 && ./emsdk activate 6.0.13
```

```bash
npm run build:wasm    # native/solver → lib/postflopSolver/wasm/solver.{web,web-threads,node,node-threads}.mjs
npm run check:wasm    # 커밋된 산출물이 소스와 같은지 (다시 빌드해서 비교)
npm run test:native   # C++ 테스트 — 같은 SIMD 코드를 AddressSanitizer + UBSan으로 빌드해 Node에서 실행
```

C++ 엔진(`native/solver/engine.cpp`)은 정규화하지 않은 반사실 가치로 카드 제거를 정확히 반영하고,
턴·리버 카드가 나뉘는 찬스 노드를 지원하며, 두 플레이어를 번갈아 업데이트한다. `lib/postflopSolver/reference/`는 같은 정의를 단순하게 옮긴
테스트 전용 TypeScript 구현(정답 기준)이다. 포스트플랍 솔브에는 WebAssembly SIMD가 필요하다(Chrome 91·
Firefox 89·Safari 16.4 이상). 지원하지 않는 브라우저에는 안내 오류를 표시한다. `cfr.ts`의 TypeScript
DCFR은 오프라인 프리플랍 생성기(`lib/preflopSolver/solveRfi.ts`)만 쓴다.

플랍·턴 솔브는 다음 스트리트를 샘플 카드와 축소 메뉴로 내다보고, 카드가 정해지면 원래 메뉴로 다시 푼다.
플랍은 턴 10장×리버 6장까지 내다보고, "Fast flop"을 켜면 턴까지만 본다(BTN vs BB 기준 약 2.4초 → 약 0.7초).
내다보기 솔브는 엔진 하나를 pthread 풀이 공유하며 리프를 큐에서 가져가 푼다. 스레드에는 SharedArrayBuffer가
필요해 `next.config.ts`의 COOP/COEP 헤더에 의존하고, 헤더가 없으면 1스레드로 돈다.

```bash
npm run bench:postflop     # 고정 스팟의 속도와 수렴 비교
npm run accuracy:postflop  # 턴·리버 전체 기준 솔브 대비 내다보기 방식별 손실 (약 30분)
```

`accuracy:postflop`은 트리가 커서 `NODE_OPTIONS=--max-old-space-size=12000`을 함께 준다.

## 테스트

```bash
npm run test
```

## 라이선스 관련 제약 (중요)

이 프로젝트는 실제 GTO 솔버(예: [TexasSolver](https://github.com/bupticybee/TexasSolver), AGPL-v3)를
**절대 런타임/배포 이미지에 포함하지 않는다.** AGPL은 네트워크 서비스로 제공 시 소스 공개 의무가
발생하므로, 그런 솔버는 개발자 로컬에서 **오프라인 1회성 도구로만** 사용한다. 솔버 코드/바이너리를
`package.json` 의존성이나 서버 코드 경로에 추가하지 말 것.
