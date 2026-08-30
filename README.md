# GTO Lite — Preflop Range Viewer

8인 토너먼트 프리플랍 레인지 뷰어. 169개 핸드(13×13 매트릭스)를 그리드로 렌더링하고, 전체
테이블 스택(1~100bb)을 설정한 뒤 각 포지션(UTG, UTG1, LJ, HJ, CO, BTN, SB, BB)의 액션을
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
  3bb, 리레이즈: 포지션 순서상 뒤(IP)면 이전 베팅의 3배·앞(OOP)면 4배).
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

## 테스트

```bash
npm run test
```

## 라이선스 관련 제약 (중요)

이 프로젝트는 실제 GTO 솔버(예: [TexasSolver](https://github.com/bupticybee/TexasSolver), AGPL-v3)를
**절대 런타임/배포 이미지에 포함하지 않는다.** AGPL은 네트워크 서비스로 제공 시 소스 공개 의무가
발생하므로, 그런 솔버는 개발자 로컬에서 **오프라인 1회성 도구로만** 사용한다. 솔버 코드/바이너리를
`package.json` 의존성이나 서버 코드 경로에 추가하지 말 것.
