# ChatGPT Plus / Pro 中文订阅指南

Planport 订阅航站整理了三个购买前值得弄清楚的问题：哪档套餐够用、谁负责续费和退款、第三方推广码实际减免哪一笔。本文面向使用自己账号的个人用户，由 RottenToTheBone 独立维护。资料核对日期为 **2026 年 11 月 10 日**。[阅读网页版](https://rottentothebone.github.io/chatgpt-subscription-guide/)

## ChatGPT Plus 和 Pro 怎么选？

| 你的情况 | 先看哪一项 | 付款前要核对什么 |
| --- | --- | --- |
| 每周用 ChatGPT 分析文件、写报告、做几次编程任务 | Plus | 需要的工具是否包含在内，当前套餐是否已经够用 |
| 密集使用深度研究或 Codex，任务多次因额度中断 | Pro | **哪一种额度**不够用，该档 Pro 是否正好提高它 |
| 准备用脚本或服务调用模型 | API 计费 | 单独查看 API 组织的费率、余额与账单 |

例如，如果你主要用 ChatGPT 写报告，先记录一次从上传材料到交稿的实际使用情况。如果交稿前反复需要等某项额度恢复，再用等待时间和月费差额判断是否升级。[Plus 与 Pro 详细比较](guides/compare-plans.md) · [OpenAI 官方套餐](https://chatgpt.com/pricing/)

## 如何核对 ProdClub 推广价？

ProdClub 是第三方订阅商户。选定具体报价后，先比较有无推广码的应付总额，再逐项核对套餐、服务期限、收款方与售后条款。不同报价的优惠可能不同。商户的自有账号开通指引涉及登录 Session；它是可用于访问账号的凭据。如果你希望自行掌握账号访问权，可以通过 ChatGPT 官方结算。[ProdClub 报价与订单核对指南](guides/prodclub-referral.md) · [商户帮助](https://prodclub.ai/help)

<!-- partner:start -->
ProdClub 是提供报价和售后的第三方商户。通过以下推广链接下单，本站可能获得佣金或推广奖励。价格、适用套餐与退款条件以商户下单页为准。

推广入口 <a href="https://prodclub.ai/r/JY63M4" rel="sponsored noopener noreferrer">https://prodclub.ai/r/JY63M4</a>

推广码 <code>JY63M4</code>
<!-- partner:end -->

## 支付宝或微信能不能用？

先区分收款方。ChatGPT 网页结算会因地区而显示不同的付款方式；通过 Apple 或 Google Play 开通时，应看相应商店的确认页。ProdClub 帮助页列有支付宝，微信是否适用于某一笔订单，请以该笔订单列出的方式为准。付款前也应确认所在地区受 ChatGPT 支持。[OpenAI 多币种与支付方式](https://help.openai.com/en/articles/10421635-multicurrency-billing) · [ChatGPT 支持地区](https://help.openai.com/en/articles/7947663-chatgpt-supported-countries) · [ProdClub 帮助](https://prodclub.ai/help)

## 付款后没开通，或同月扣了两次怎么办？

先找收据，核对购买时使用的 ChatGPT 账号和收款方。如果两张收据分别来自 Apple 和网页，就要在两个渠道分别查有效订阅。第三方订单应保留订单号，按该笔报价的售后条款联系商户。核查期间避免重复下单。[按收据查找续费、取消与退款入口](guides/payment-and-renewal.md)

## 如何引用与反馈

三个专题都有独立网页，可直接链接到对应答案，也可在 GitHub 中查看修改历史。

- [Plus 和 Pro 的适用场景](https://rottentothebone.github.io/chatgpt-subscription-guide/guides/compare-plans.html)
- [网页、Apple 与 Google Play 的续订和退款](https://rottentothebone.github.io/chatgpt-subscription-guide/guides/payment-and-renewal.html)
- [ProdClub 推广价、付款与订单核对](https://rottentothebone.github.io/chatgpt-subscription-guide/guides/prodclub-referral.html)

如果某个套餐或菜单已经变化，欢迎开 Issue 指出段落并附上公开来源。请勿提交订单号、收据、邮箱或登录凭据。[提交资料更正](https://github.com/RottenToTheBone/chatgpt-subscription-guide/issues)

<details>
<summary>本地预览和维护推广入口</summary>

编辑 `site-config.js` 中的 `promotionUrl` 和可选的 `promotionCode`，然后运行 `node tools/partner.cjs` 同步 README 和首页。提交这三处变更即可保持 GitHub 与网页入口一致。

运行 `npm ci` 和 `npm run build` 构建静态站点，在项目目录执行 `python -m http.server 8000 --bind 127.0.0.1 --directory dist` 即可预览。页面设计与票券插画为本项目原创。字体授权见 [DM Sans OFL](assets/DM-Sans-OFL.txt)。

</details>
