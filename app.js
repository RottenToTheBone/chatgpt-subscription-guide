(() => {
  "use strict";

  const byId = (id) => document.getElementById(id);
  const planNames = { plus: "Plus", pro: "Pro" };
  const options = document.querySelectorAll("[data-plan-option]");
  const guide = byId("guide");
  const guideTitle = guide.querySelector("h2") || guide;
  if (!guideTitle.hasAttribute("tabindex")) guideTitle.tabIndex = -1;
  const guideEntry = byId("guide-entry");
  function selectPlan(plan) {
    const name = planNames[plan];
    byId("guide-plan").textContent = name;
    options.forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.planOption === plan));
    });
    guideEntry.href = `https://chatgpt.com/explore/${plan}`;
    guideEntry.querySelector("[data-entry-label]").textContent = `前往官方开通 ${name}`;
    byId("guide-step-title-2").textContent = `选择 ${name}，核对订单`;
    byId("guide-step-copy-2").textContent = `打开官方 ${name} 套餐页，核对结算币种、订阅周期和下次扣款金额，再确认付款。`;
    byId("guide-step-copy-3").textContent = `回到 ChatGPT 的账号设置，确认套餐已显示为 ${name}。保留付款收据，方便管理续订。`;
  }

  function planFromHash() {
    if (location.hash === "#guide-pro") return "pro";
    if (location.hash === "#guide-plus") return "plus";
    return null;
  }

  selectPlan(planFromHash() || "plus");
  window.addEventListener("hashchange", () => {
    const plan = planFromHash();
    if (plan) selectPlan(plan);
  });

  document.querySelectorAll("a[data-choose-plan]").forEach((link) => {
    const plan = link.dataset.choosePlan;
    link.setAttribute("href", `#guide-${plan}`);
    link.addEventListener("click", (event) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      selectPlan(plan);
      // Keep native anchor navigation and move keyboard focus to the destination heading.
      requestAnimationFrame(() => guideTitle.focus({ preventScroll: true }));
    });
  });

  options.forEach((button) => {
    button.addEventListener("click", () => {
      const plan = button.dataset.planOption;
      selectPlan(plan);
      const hash = `#guide-${plan}`;
      if (location.hash === hash) return;
      try {
        history.replaceState(history.state, "", hash);
      } catch {
        location.replace(hash);
      }
    });
  });

  const promoCode = byId("promo-code");
  const copyButton = byId("copy-code");
  if (!promoCode || !copyButton) return;
  const code = promoCode.textContent;
  const status = byId("copy-status");
  copyButton.hidden = false;
  copyButton.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(code);
      status.textContent = "优惠码已复制。";
    } catch {
      const range = document.createRange();
      range.selectNodeContents(promoCode);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      try {
        if (document.execCommand("copy")) {
          status.textContent = "优惠码已复制。";
          return;
        }
      } catch {
        // Keep the text selected for browsers that disable clipboard access.
      }
      status.textContent = "优惠码已选中，请手动复制。";
    }
  });
})();
