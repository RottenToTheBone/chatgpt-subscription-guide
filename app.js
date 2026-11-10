(() => {
  "use strict";
  const code = document.querySelector("#entry-link [data-promo-code]");
  const button = document.getElementById("copy-code");
  const status = document.getElementById("copy-status");
  if (!code?.textContent.trim() || !button || !status) return;

  button.hidden = false;
  button.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(code.textContent.trim());
      status.textContent = "优惠码已复制。";
      return;
    } catch {
      // File previews and restricted browsers may only support copying from a selection.
    }
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(code);
    selection.removeAllRanges();
    selection.addRange(range);
    try {
      if (document.execCommand("copy")) {
        status.textContent = "优惠码已复制。";
        return;
      }
    } catch {
      // A manual copy works even when the browser denies clipboard access.
    }
    status.textContent = "优惠码已选中，请手动复制。";
  });
})();
