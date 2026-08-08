import { state, setState } from "./state.js";

export function wireModeSwitch({ onSwitch }) {
  document.querySelectorAll(".mode-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const targetMode = btn.dataset.mode;
      if (targetMode === state.mode) return;
      if (state.phase === "active" || state.phase === "connecting") {
        const ok = window.confirm("Switching modes will reset the current game. Continue?");
        if (!ok) return;
      }
      setState({ mode: targetMode, phase: "setup" });
      onSwitch(targetMode);
    });
  });
}
