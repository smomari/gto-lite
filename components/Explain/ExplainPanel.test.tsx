import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { setLocale } from "@/lib/i18n/locale";
import { SAMPLE_SUMMARY } from "@/lib/explain/explainTestUtils";
import { EXPLAIN_REMAINING_HEADER, type ExplainStatus } from "@/types/explainApi";
import { ExplainPanel } from "./ExplainPanel";

function mockFetch(status: ExplainStatus, post: () => Response) {
  const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => (init?.method === "POST" ? post() : Response.json(status)));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
  act(() => setLocale("en"));
});

/** The allowance line, whose count sits in its own span. */
function allowance(count: string) {
  return screen.getByText((_, el) => el?.tagName === "SPAN" && (el.textContent ?? "").startsWith(`${count} left today`));
}

const OPEN: ExplainStatus = { available: true, remaining: 3, limit: 3, globalExhausted: false };

describe("ExplainPanel", () => {
  it("shows nothing when the server has explanations turned off", async () => {
    const fetchMock = mockFetch({ available: false }, () => new Response());
    const { container } = render(<ExplainPanel buildSummary={() => SAMPLE_SUMMARY} />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it("sends the summary, renders the explanation's sections, and updates what's left", async () => {
    const fetchMock = mockFetch(OPEN, () => new Response("## Preflop\nBTN opens **42%**.\n\n## Flop\nBB checks.", { headers: { [EXPLAIN_REMAINING_HEADER]: "2" } }));
    const buildSummary = vi.fn(() => SAMPLE_SUMMARY);
    render(<ExplainPanel buildSummary={buildSummary} />);
    fireEvent.click(await screen.findByRole("button", { name: "Explain this hand" }));

    expect(await screen.findByRole("heading", { name: "Flop" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Preflop" })).toBeInTheDocument();
    expect(screen.getByText("42%").tagName).toBe("STRONG");
    expect(allowance("2/3")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Explain this hand" })).not.toBeInTheDocument();
    expect(screen.getByText(/Written by AI/)).toBeInTheDocument();
    expect(fetchMock.mock.calls[1][0]).toBe("/api/explain?lang=en");
    expect(JSON.parse(fetchMock.mock.calls[1][1]!.body as string)).toEqual(SAMPLE_SUMMARY);
  });

  it("asks for Korean, and speaks it, when the page is in Korean", async () => {
    setLocale("ko");
    const fetchMock = mockFetch(OPEN, () => new Response("## 프리플랍\nBTN 오픈.", { headers: { [EXPLAIN_REMAINING_HEADER]: "2" } }));
    render(<ExplainPanel buildSummary={() => SAMPLE_SUMMARY} />);
    fireEvent.click(await screen.findByRole("button", { name: "이 핸드 설명 보기" }));
    expect(await screen.findByRole("heading", { name: "프리플랍" })).toBeInTheDocument();
    expect(fetchMock.mock.calls[1][0]).toBe("/api/explain?lang=ko");
    expect(screen.getByText(/솔버 수치로 AI가 쓴/)).toBeInTheDocument();
  });

  it("explains a limit error and offers to try again", async () => {
    mockFetch(OPEN, () => Response.json({ error: "limit", code: "USER_LIMIT", remaining: 0 }, { status: 429 }));
    render(<ExplainPanel buildSummary={() => SAMPLE_SUMMARY} />);
    fireEvent.click(await screen.findByRole("button", { name: "Explain this hand" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("You've used today's AI explanations");
    expect(screen.getByRole("button", { name: "Try again" })).toBeDisabled();
    expect(allowance("0/3")).toBeInTheDocument();
  });

  it("is disabled once the service is closed for the day", async () => {
    mockFetch({ ...OPEN, globalExhausted: true }, () => new Response());
    render(<ExplainPanel buildSummary={() => SAMPLE_SUMMARY} />);
    expect(await screen.findByRole("button", { name: "Explain this hand" })).toBeDisabled();
    expect(screen.getByText("Closed for today")).toBeInTheDocument();
  });
});
