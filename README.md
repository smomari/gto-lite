# GTO Lite — Preflop Range Viewer

토너먼트 포커 프리플랍 레인지 뷰어. 169개 핸드(13×13 매트릭스)를 그리드로 렌더링하고,
포지션 × 스택 뎁스 × 액션 시퀀스(Open, vs 3-Bet, vs 4-Bet 등)에 따른 Fold/Call/Raise 빈도를
색상 바로 보여준다.

## 개발 서버 실행

```bash
npm run dev
```

[http://localhost:3000](http://localhost:3000) 접속.

## 레인지 데이터 생성

레인지 데이터는 `public/data/ranges/`에 정적 JSON으로 저장되며, 오프라인 스크립트로 생성한다.

```bash
npm run generate:equity     # 169x169 all-in equity 매트릭스 (data/equity/, 커밋됨)
npm run generate:all        # nash + heuristic 레인지 + manifest.json
```

데이터 소스는 두 가지다:

- **`nash-shove-fold`** — 20bb류 shove/fold 스팟과 40bb/100bb의 vs-4bet 같은 깊은 노드를
  고정점 반복(Nash push/fold) 알고리즘으로 직접 계산한 값. Chip-EV만 반영(ICM 제외).
- **`heuristic-approx`** — 40bb/100bb의 RFI/vs-open/vs-3bet/squeeze처럼 postflop EV가 필요한
  스팟은 규칙 기반 근사치로 채움. UI에 "Heuristic Approximation" 배지로 명시됨.

## 테스트

```bash
npm run test
```

## 라이선스 관련 제약 (중요)

이 프로젝트는 실제 GTO 솔버(예: [TexasSolver](https://github.com/bupticybee/TexasSolver), AGPL-v3)를
**절대 런타임/배포 이미지에 포함하지 않는다.** AGPL은 네트워크 서비스로 제공 시 소스 공개 의무가
발생하므로, 그런 솔버는 개발자 로컬에서 **오프라인 1회성 도구로만** 사용하고 결과 JSON만
`public/data/ranges/solver-export/`에 커밋하는 방식으로만 활용한다. 솔버 코드/바이너리를
`package.json` 의존성이나 서버 코드 경로에 추가하지 말 것.
