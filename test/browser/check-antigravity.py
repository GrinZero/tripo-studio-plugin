"""Standard MCP Apps fixture, not native AGY: no account or cloud billing.

Run with i18n-server.mjs on port 43911 and Python Playwright installed.
The fixture has an opaque sandbox origin, inline-only display capabilities,
and no conversation/message capability, matching the AGY global-view contract.
"""

from pathlib import Path

from playwright.sync_api import expect, sync_playwright

BASE = "http://127.0.0.1:43911"
OUTPUT = Path("output/playwright")
OUTPUT.mkdir(parents=True, exist_ok=True)

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1360, "height": 900})
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    try:
        page.request.get(f"{BASE}/reset")
        page.goto(f"{BASE}/?host=antigravity&assets=1&layout=1&locale=zh-CN")
        page.wait_for_load_state("networkidle")
        frame = page.frame_locator("#app")
        expect(frame.locator("#connection")).to_be_hidden()
        expect(frame.locator("model-viewer")).to_be_visible(timeout=30000)
        page.wait_for_function(
            "document.querySelector('#app').contentWindow !== null"
        )
        frame.locator("model-viewer").evaluate(
            "async element => { if (!element.loaded) await new Promise((resolve, reject) => {"
            "element.addEventListener('load', resolve, {once:true});"
            "element.addEventListener('error', reject, {once:true}); }); }"
        )
        page.screenshot(path=str(OUTPUT / "antigravity-workbench.png"))

        page.request.get(f"{BASE}/reset")
        page.goto(f"{BASE}/?host=antigravity&card=configuration&locale=zh-CN")
        page.wait_for_load_state("networkidle")
        frame = page.frame_locator("#app")
        expect(frame.locator(".configuration")).to_be_visible()
        face_limit = frame.get_by_role("spinbutton", name="目标面数")
        expect(face_limit).to_have_value("60000")
        face_limit.fill("24000")
        expect(frame.get_by_role("button", name="保存并提交", exact=True)).to_be_enabled()
        frame.get_by_role("button", name="取消", exact=True).click()
        expect(frame.get_by_text("已取消", exact=True).first).to_be_visible()
        stats = page.request.get(f"{BASE}/stats").json()
        assert stats["review"]["status"] == "canceled", stats["review"]
        assert stats["review"]["review_id"] == "review"
        assert not any(call["name"] == "tripo_generate_model" for call in stats["calls"])
        page.screenshot(path=str(OUTPUT / "antigravity-canceled-card.png"))
        assert not errors, errors
        print("PASS: opaque-origin AGY-style global workbench, GLB loading, card edit/cancel, no conversation capabilities")
    finally:
        browser.close()
