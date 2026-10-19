import { runSuite, junit, html } from "./testkit.mjs";
import { writeFileSync, mkdirSync } from "node:fs";
const args = process.argv.slice(2),
  profile = args[args.indexOf("--profile") + 1] || "offline";
let report;
if (profile === "offline")
  report = await runSuite({ broken: args.includes("--broken-reference") });
else if (profile === "live")
  report = {
    profile: "live",
    cases: [
      {
        scenario: "passport_purchase",
        status: "blocked",
        reason:
          "Requires a pinned approved session, target, spend budget and external evidence adapter. No purchase sent.",
      },
    ],
    summary: { failed: 0, blocked: 1, live_pass: 0, mock_pass: 0 },
  };
else throw Error("profile must be offline or live");
mkdirSync("reports", { recursive: true });
writeFileSync("reports/report.json", JSON.stringify(report, null, 2));
writeFileSync("reports/junit.xml", junit(report));
writeFileSync("reports/report.html", html(report));
console.log(JSON.stringify(report.summary));
if (report.summary.failed || report.summary.blocked) process.exitCode = 1;
