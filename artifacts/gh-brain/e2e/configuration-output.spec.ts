import {test, expect} from "./fixtures";

test("output controls live in Configuration and the deliverable reflects the same settings", async ({page}) => {
  await page.goto("/session?e2e=1");
  await page.getByRole("button", {name:/^Deliverable/}).click();
  await expect(page.getByTestId("deliverable-summary")).toContainText("Court consensus");
  await expect(page.getByText("Response Mode", {exact:true})).toHaveCount(0);
  await page.getByRole("button", {name:"Edit configuration",exact:true}).click();
  const dialog=page.getByRole("dialog");
  await expect(dialog.getByRole("heading",{name:"Configuration"})).toBeVisible();
  async function choose(label:string, option:string) {
    await dialog.getByRole("combobox",{name:label,exact:true}).click();
    await page.getByRole("option",{name:option,exact:true}).click();
  }
  await choose("Response view", "Consensus + individual");
  await choose("Document creation", "Answer only");
  await expect(dialog.getByRole("combobox",{name:"Document type",exact:true})).toHaveCount(0);
  await choose("Answer style", "Bullet points");
  await choose("Response depth", "thorough");
  await choose("Download format", "Markdown");
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("deliverable-summary")).toContainText("Consensus + individual · Answer only · Bullet points · thorough · Markdown");
  await page.getByRole("button", {name:"Edit configuration",exact:true}).click();
  await expect(dialog.getByRole("combobox",{name:"Response view",exact:true})).toContainText("Consensus + individual");
  await choose("Response view", "Document");
  await expect(dialog.getByRole("combobox",{name:"Document creation",exact:true})).toContainText("Always build a document");
  await choose("Document type", "Legal brief");
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("deliverable-summary")).toContainText("Legal brief");
});

test("selected output is used for the result, and accepted sessions cannot be reconfigured", async ({page}) => {
  await page.goto("/session?e2e=1");
  await page.getByRole("button",{name:/⚙ Configure/}).click();
  await page.getByRole("combobox",{name:"Response view",exact:true}).click();
  await page.getByRole("option",{name:"Individual responses",exact:true}).click();
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => typeof (window as any).__testPdfExport === "function");
  await page.evaluate(() => (window as any).__testPdfExport("CONSENSUS_ONLY_MARKER"));
  await expect(page.getByRole("tab",{name:"Individual responses",exact:true})).toBeVisible();
  const panel=page.getByRole("tabpanel");
  await expect(panel).toContainText("Test debate notes.");
  await expect(panel).not.toContainText("CONSENSUS_ONLY_MARKER");
  await expect(page.getByRole("button",{name:/⚙ Configure/})).toBeDisabled();
  const downloadPromise=page.waitForEvent("download");
  await page.getByRole("button",{name:"PDF",exact:true}).click();
  expect((await downloadPromise).suggestedFilename()).toMatch(/\.pdf$/);
});
