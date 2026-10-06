import { test, expect } from "./fixtures";
import { TEMPLATES } from "../../../lib/api-zod/src/templates";

for (const width of [360, 412]) {
  test(`template intake and question answers work at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 915 });
    await page.route("**/api-server/api/templates", route => route.fulfill({ json: TEMPLATES }));
    const requests: any[] = [];
    await page.route("**/api-server/api/run-brain", async route => {
      requests.push(route.request().postDataJSON());
      const first = requests.length === 1;
      const sessionId = first ? "template-question" : "template-answer";
      const question = "Who will read your plan?";
      const events = [
        { type: "start", sessionId, estimatedCredits: 12 },
        { type: "done", sessionId, status: first ? "relay_needed" : "complete", confidence: first ? 0 : 90,
          creditsUsed: 2, finalAnswer: first ? question : "Your business plan is ready.",
          transcript: first ? `**Orchestrator:** ${question}` : "Saved answers and plan",
          artifacts: first ? "" : "A practical plan for the owner.", artifactPath: first ? "no-artifact" : "artifact",
          courtroomOutcome: { reason: first ? "not_enough" : "approved", round: first ? 0 : 1, confidenceAtExit: first ? 0 : 90 },
          relayCount: first ? 0 : 1, ...(first ? { needsRelay: true, relayQuestion: question } : {}) },
      ];
      await route.fulfill({ contentType: "text/event-stream", body: events.map(event => `data: ${JSON.stringify(event)}\n\n`).join("") });
    });
    await page.goto("/session?e2e=1&templateId=business-plan");
    const intake = page.getByTestId("template-questions");
    await expect(intake).toBeVisible();
    await expect(intake.getByLabel("Pricing and costs")).not.toBeVisible();
    await intake.getByLabel("Business and stage").fill("A bakery selling bread.\nI am at the planning stage.");
    await intake.getByLabel("Customers and location").fill("Local families in Boston");
    await intake.getByLabel("Purpose of the plan").fill("I don't know yet");
    await intake.getByText("Optional details (4)").click();
    await intake.getByLabel("Pricing and costs").fill("Budget is $10,000; other costs unknown");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.getByRole("button", { name: "Run Trial", exact: true }).click();
    await expect(page.getByLabel("Your answers to the court")).toBeVisible();
    expect(requests[0].question).toContain("Budget is $10,000");
    await page.getByLabel("Your answers to the court").fill("For my own roadmap. I don't know the rent yet.");
    await page.getByRole("button", { name: /Submit to court/ }).click();
    await expect.poll(() => requests.length).toBe(2);
    expect(requests[1]).toMatchObject({ templateId: "business-plan", relayContext: {
      parentSessionId: "template-question", missingInfo: "For my own roadmap. I don't know the rent yet.", relayRound: 1,
    } });
    await expect(page.getByLabel("Your answers to the court")).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}
