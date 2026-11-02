import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { SettingsDialog } from "./SettingsDialog";

function renderDialog(stackBb = 100) {
  const onApply = vi.fn();
  const onClose = vi.fn();
  render(<SettingsDialog stackBb={stackBb} onApply={onApply} onClose={onClose} />);
  return { onApply, onClose };
}

describe("SettingsDialog", () => {
  it("opens with the current stack and only tournament selectable", () => {
    renderDialog(40);
    expect(screen.getByRole("dialog", { name: "Settings" })).toBeInTheDocument();
    expect(screen.getByRole("spinbutton")).toHaveValue(40);
    expect(screen.getByRole("radio", { name: "Tournament 8-max" })).toBeChecked();
    expect(screen.getByRole("radio", { name: /Cash 6-max/ })).toBeDisabled();
    expect(screen.getByRole("radio", { name: /Cash 8-max/ })).toBeDisabled();
  });

  it("only hands the stack over on Apply", () => {
    const { onApply } = renderDialog();
    fireEvent.change(screen.getByRole("slider"), { target: { value: "60" } });
    expect(onApply).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(onApply).toHaveBeenCalledWith(60);
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
});
