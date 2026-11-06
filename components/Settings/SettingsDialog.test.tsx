import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { TOURNAMENT_8, gameFormatById } from "@/lib/solveEngine/gameFormat";
import { DEFAULT_RAKE_SETTINGS, rakeById } from "@/lib/solveEngine/rake";
import { CHIP_EV, icmById } from "@/lib/solveEngine/icm";
import { SettingsDialog } from "./SettingsDialog";

function renderDialog(stackBb = 100) {
  const onApply = vi.fn();
  const onClose = vi.fn();
  render(<SettingsDialog format={TOURNAMENT_8} rake={DEFAULT_RAKE_SETTINGS} icm={CHIP_EV} stackBb={stackBb} onApply={onApply} onClose={onClose} />);
  return { onApply, onClose };
}

describe("SettingsDialog", () => {
  it("opens with the current table", () => {
    renderDialog(40);
    expect(screen.getByRole("dialog", { name: "Settings" })).toBeInTheDocument();
    expect(screen.getByRole("spinbutton")).toHaveValue(40);
    expect(screen.getByRole("radio", { name: "Tournament 8-max" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Cash 6-max" })).not.toBeChecked();
  });

  it("only hands the stack and format over on Apply", () => {
    const { onApply } = renderDialog();
    fireEvent.change(screen.getByRole("slider"), { target: { value: "60" } });
    fireEvent.click(screen.getByRole("radio", { name: "Cash 6-max" }));
    expect(onApply).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(onApply).toHaveBeenCalledWith(60, gameFormatById("cash-6"), DEFAULT_RAKE_SETTINGS, CHIP_EV);
  });

  it("asks for rake only at a cash table", () => {
    renderDialog();
    expect(screen.queryByRole("group", { name: "Rake" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: "Cash 8-max" }));
    expect(screen.getByRole("group", { name: "Rake" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Online low/ })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "No flop, no drop" })).toBeChecked();
    fireEvent.click(screen.getByRole("radio", { name: "Tournament 8-max" }));
    expect(screen.queryByRole("group", { name: "Rake" })).not.toBeInTheDocument();
  });

  it("hands the chosen rake over on Apply", () => {
    const { onApply } = renderDialog();
    fireEvent.click(screen.getByRole("radio", { name: "Cash 8-max" }));
    fireEvent.click(screen.getByRole("radio", { name: /Live/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: "No flop, no drop" }));
    expect(onApply).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(onApply).toHaveBeenCalledWith(100, gameFormatById("cash-8"), { structure: rakeById("live"), noFlopNoDrop: false }, CHIP_EV);
  });

  it("asks for an ICM stage only at a tournament table", () => {
    renderDialog();
    expect(screen.getByRole("group", { name: "ICM" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Chip EV/ })).toBeChecked();
    fireEvent.click(screen.getByRole("radio", { name: "Cash 8-max" }));
    expect(screen.queryByRole("group", { name: "ICM" })).not.toBeInTheDocument();
  });

  it("hands the chosen ICM stage over on Apply", () => {
    const { onApply } = renderDialog();
    fireEvent.click(screen.getByRole("radio", { name: /^Bubble/ }));
    expect(onApply).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(onApply).toHaveBeenCalledWith(100, TOURNAMENT_8, DEFAULT_RAKE_SETTINGS, icmById("bubble"));
  });

  it.each(["Cancel", "Close"])("%s drops the draft", (name) => {
    const { onApply, onClose } = renderDialog();
    fireEvent.change(screen.getByRole("slider"), { target: { value: "60" } });
    fireEvent.click(screen.getByRole("button", { name }));
    expect(onClose).toHaveBeenCalledOnce();
    expect(onApply).not.toHaveBeenCalled();
  });

  it("closes on a backdrop click, but not when a slider drag is released there", () => {
    const { onClose } = renderDialog();
    const dialog = screen.getByRole("dialog");

    fireEvent.mouseDown(screen.getByRole("slider"));
    fireEvent.click(dialog);
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.mouseDown(dialog);
    fireEvent.click(dialog);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it.each(["Cancel", "Apply"])("%s closes the dialog itself, so the browser returns focus", (name) => {
    const close = vi.spyOn(HTMLDialogElement.prototype, "close");
    renderDialog();
    fireEvent.click(screen.getByRole("button", { name }));
    expect(close).toHaveBeenCalledOnce();
    close.mockRestore();
  });
});
