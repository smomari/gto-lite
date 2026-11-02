# GTO Lite — Preflop Range Viewer

토너먼트 8인, 캐시 6인, 캐시 8인 프리플랍 레인지 뷰어. 169개 핸드(13×13 매트릭스)를 그리드로 렌더링하고, 전체
테이블 스택(2~100bb)을 설정한 뒤 각 포지션(UTG, UTG1, LJ, HJ, CO, BTN, SB, BB)의 액션을
순서대로 클릭해서 실제 포커 액션 시퀀스(재오픈 포함)를 만들면, 현재 차례인 포지션의
Fold/Call/Raise/Allin 빈도를 색상 바로 보여준다.

## 개발 서버 실행

```bash
npm run dev
```

[http://localhost:3000](http://localhost:3000) 접속.

## 아키텍처

레인지는 정적 파일이 아니라 **요청마다 서버에서 즉시 계산**된다 (`POST /api/solve`) — 게임 형식 × 레이크 ×
연속 스택 × 자유로운 액션 시퀀스는 조합이 너무 많아 미리 생성해둘 수 없기 때문.

- `lib/solveEngine/potState.ts` + `rotation.ts` + `replay.ts` — 액션 시퀀스를 실제 포커 규칙
  (재오픈 포함)으로 검증/재생하며 팟/콜금액/다음 차례를 추적.
- `lib/solveEngine/actionSizing.ts` — 레이즈 사이즈 자동 계산(오픈 사이즈는 `gameFormat.ts`, 리레이즈는
  포스트플랍에서 마지막 공격자보다 뒤에 행동(IP)하면 이전 베팅의 3배, 앞(OOP)이면 4배 — SB는 항상 OOP, BB는 SB 상대로만 IP).
- SB는 16bb 이상에서 림프할 수 있고, BB는 그 뒤에서 체크하거나 3.5bb로 레이즈한다. BB 체크로 프리플랍이 끝난다.
- `lib/solveEngine/classify.ts` — 스택이 얕거나(≤15bb) 팟 대비 남은 스택이 적으면 푸시/폴드 구간으로, 아니면 근사 레인지 엔진
  (`lib/heuristicRanges/`)으로 라우팅. 푸시/폴드 구간의 새 쇼브는 Nash 솔버(`lib/nashSolver/pushFoldSolver.ts`)로 풀고,
  액션이 더 있었던 스팟은 실제 팟과 상대 범위로 콜을 판단한다.
- 자기 범위가 있는 좌석이 재레이즈를 맞으면 `lib/heuristicRanges/vsReraise.ts`로 간다. 범위 전체의 에쿼티가 콜 가격을 얼마나 넘는지로
  계속할 비율을 정하고, 플레이어빌리티가 높은 핸드부터 채운다. 핸드별 EV 기준은 쓰지 않는다: 올인 에쿼티가 좁은 구간에 몰려 있어
  작은 변화에도 거의 전부 또는 거의 0으로 뒤집히기 때문이다. 실현율과 계속 비율 상수는 추정치다.
- 16~25bb 첫 액션은 레이즈 위주이고, 스택이 얕을수록 범위 중간 핸드의 일부가 올인으로 바뀐다.
- `lib/equity/loadEquityMatrix.ts` — 169×169 all-in equity 매트릭스(오프라인 생성, 커밋됨)를
  읽어 위 두 엔진에 공급.

앤티는 BB가 1bb를 추가로 내는 방식(BB 앤티)으로 계산한다. Chip-EV만 반영(ICM 제외).

게임 형식은 `lib/solveEngine/gameFormat.ts`에 정의한다. 캐시는 앤티가 없고, 오픈은 2.5bb(SB 3bb)이며, SB는 레이즈 또는
폴드만 한다. 6인은 UTG와 UTG1이 없는 8인 테이블로 처리해 오픈 폭 표를 함께 쓴다. 캐시 폭 표는 공개 차트 사이의 초기값이다.

레이크 프리셋은 `lib/solveEngine/rake.ts`에 있다. 포스트플랍과 Nash 푸시/폴드는 실제 보상에 레이크를 넣어 계산한다(폴드는 콜되지
않은 베팅을 돌려준 뒤의 팟에만 걷는다). 폭 표 구간은 규칙으로 조정한다: 오픈 폭과 레이즈에 대한 계속 폭을 `config.ts`의 민감도 상수로
줄인다. 이 상수는 검증되지 않은 값이다.

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
Firefox 89·Safari 16.4 이상). 지원하지 않는 브라우저에는 안내 오류를 표시한다.

플랍·턴 솔브는 다음 스트리트를 샘플 카드와 축소 메뉴로 내다보고, 카드가 정해지면 원래 메뉴로 다시 푼다.
턴은 리버 전체를 본다. 플랍은 레인지에 맞춰 고른 턴 16장×리버 6장까지 내다보고, "Fast flop"을 켜면 턴 10장까지만
본다(BTN vs BB 기준 약 4초 → 약 1.1초). 코어가 4개 이하면 Fast flop이 기본으로 켜진다.
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
