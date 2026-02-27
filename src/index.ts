import "dotenv/config";
import { app } from "./app.js";
import { startMatchesCron } from "./cron.js";
import { startPredictionCron } from "./predictionCron.js";

const port = Number(process.env.PORT || 4000);

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`API listening on http://localhost:${port}`);
  startMatchesCron();
  startPredictionCron();
});


