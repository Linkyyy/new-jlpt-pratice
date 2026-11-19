"""Check the running app with Python Playwright and Chromium.

Run `python scripts/check-passage-layout.py [http://localhost:3000]`.
"""

import shutil
import sys
from urllib.parse import urlencode

from playwright.sync_api import sync_playwright


def swipe_up(touch, x, y, height):
    def move(kind, points):
        touch.send("Input.dispatchTouchEvent", {"type": kind, "touchPoints": points})

    move("touchStart", [{"x": x, "y": y}])
    for step in range(1, 7):
        move("touchMove", [{"x": x, "y": y - height * step / 10}])
    move("touchEnd", [])


def scroll_to_end(page, touch):
    pane = page.locator(".passage-scroll")
    box = pane.bounding_box()
    x = box["x"] + box["width"] / 2
    y = box["y"] + box["height"] * 0.8
    at_end = "e => e.scrollHeight - e.clientHeight - e.scrollTop < 2"
    for _ in range(60):
        if pane.evaluate(at_end):
            return
        if touch:
            swipe_up(touch, x, y, box["height"])
        else:
            page.mouse.move(x, y)
            page.mouse.wheel(0, box["height"] * 2)
        page.wait_for_timeout(80)
    assert pane.evaluate(at_end), "Scrolling over the passage did not reach its end"


def check_passage(browser, base, question_id, width, height, exam=False):
    mobile = width < 1024
    page = browser.new_page(viewport={"width": width, "height": height}, is_mobile=mobile, has_touch=mobile)
    try:
        _, year, level, kind, _, _ = question_id.split(":")
        query = urlencode(dict(source="imported", year=year, level=level, type={"2": "grammar", "3": "reading"}[kind],
                               mode="exam" if exam else "practice", question=question_id, fresh=1))
        page.goto(f"{base}/practice?{query}", wait_until="domcontentloaded")
        if exam:
            page.get_by_role("button", name="开始考试", exact=True).click()
        pen = page.get_by_role("button", name="画笔", exact=True)
        pen.wait_for()
        on_screen = """button => {
            const r = button.getBoundingClientRect();
            return button.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
        }"""
        assert pen.evaluate(on_screen), "The pen must be visible before scrolling"
        handle = page.locator(".reading-sheet-handle")
        handle.click()
        assert handle.get_attribute("aria-expanded") == "true"
        sheet = page.locator(".reading-sheet")
        default_height = sheet.bounding_box()["height"]
        assert default_height <= 180, "The default drawer is too tall"
        touch = page.context.new_cdp_session(page) if mobile else None
        for size in ("default", "maximum"):
            if size == "maximum":
                handle.press("End")
                assert sheet.bounding_box()["height"] > default_height
            scroll_to_end(page, touch)
            assert pen.evaluate(on_screen), "The pen scrolled out of view"
            assert page.locator(".question-passage").evaluate("""text => {
                const walker = document.createTreeWalker(text, NodeFilter.SHOW_TEXT);
                let last;
                while (walker.nextNode()) if (walker.currentNode.data.trim()) last = walker.currentNode;
                const end = last.data.trimEnd().length;
                const range = document.createRange();
                range.setStart(last, end - 1);
                range.setEnd(last, end);
                const glyph = range.getBoundingClientRect();
                const pane = text.closest(".passage-scroll").getBoundingClientRect();
                const drawer = document.querySelector(".reading-sheet").getBoundingClientRect();
                return pane.bottom <= drawer.top && glyph.top >= pane.top && glyph.bottom <= pane.bottom
                    && text.contains(document.elementFromPoint(glyph.x + glyph.width / 2, glyph.y + glyph.height / 2));
            }"""), f"Last character is covered at {width}×{height} with the {size} drawer"
    finally:
        page.close()


if __name__ == "__main__":
    base_url = (sys.argv[1] if len(sys.argv) > 1 else "http://localhost:3000").rstrip("/")
    reading = "imported:201507:N1:3:5346:56"
    grammar = "imported:201607:N1:2:5119:43"
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(executable_path=shutil.which("chromium"))
        check_passage(browser, base_url, reading, 390, 844)
        check_passage(browser, base_url, grammar, 844, 390, exam=True)
        check_passage(browser, base_url, grammar, 1280, 800)
        browser.close()
