const express = require("express");
const axios = require("axios");
const fs = require("fs");
const path = require("path");

const app = express();
const cors = require("cors");
app.use(cors());

const PORT = 3000;
const API_URL = "https://api.upgrader.com/affiliate/creator/get-stats";
const API_KEY = "9c0cfe22-0028-48a5-badd-1ba6663a481a";

// Get next Saturday midnight UTC
const getNextSaturdayMidnightUTC = () => {
  let now = new Date();
  let nextSaturday = new Date(now);

  nextSaturday.setUTCDate(now.getUTCDate() + ((6 - now.getUTCDay() + 7) % 7));
  nextSaturday.setUTCHours(0, 0, 0, 0);

  return nextSaturday.getTime();
};

// Fetch and store leaderboard data
const fetchData = async () => {
  try {
    const countdownEndTime = getNextSaturdayMidnightUTC();
    const fromDate = new Date(countdownEndTime - 7 * 24 * 60 * 60 * 1000);
    const toDate = new Date();

    const payload = {
      apikey: API_KEY,
      from: fromDate.toISOString().split("T")[0],
      to: toDate.toISOString().split("T")[0],
    };

    const response = await axios.post(API_URL, payload);

    if (!response.data.error) {
      console.log("Data fetched successfully");

      const dataFilePath = path.join(__dirname, "data.json");
      fs.writeFileSync(dataFilePath, JSON.stringify(response.data, null, 2));

      const summarizedBetsFilePath = path.join(
        __dirname,
        "summarized_bets.json"
      );
      let summarizedBetsData = response.data.data.summarizedBets || [];

      // Convert wager from cents to dollars with two decimal places
      summarizedBetsData = summarizedBetsData.map((bet) => ({
        ...bet,
        wager: (bet.wager / 100).toFixed(2),
      }));

      summarizedBetsData.sort((a, b) => b.wager - a.wager); // Sort descending

      const leaderboardData = {
        countdownEndTime,
        summarizedBets: summarizedBetsData,
      };

      fs.writeFileSync(
        summarizedBetsFilePath,
        JSON.stringify(leaderboardData, null, 2)
      );
    } else {
      console.error("API error:", response.data.msg);
    }
  } catch (error) {
    console.error("Error fetching data:", error.message);
  }
};

// Archive leaderboard at reset time
const archiveLeaderboard = async () => {
  try {
    const summarizedBetsFilePath = path.join(__dirname, "summarized_bets.json");
    const archiveFilePath = path.join(__dirname, "previous_leaderboards.json");

    if (fs.existsSync(summarizedBetsFilePath)) {
      const leaderboardData = JSON.parse(
        await fs.promises.readFile(summarizedBetsFilePath, "utf8")
      );

      // Store only the latest week's data
      await fs.promises.writeFile(
        archiveFilePath,
        JSON.stringify([leaderboardData], null, 2)
      );

      // Clear current leaderboard
      await fs.promises.unlink(summarizedBetsFilePath);
    }
  } catch (error) {
    console.error("Error archiving leaderboard:", error);
  }
};

// **Fixed Reset Timing** - Runs every minute but triggers only once per week
setInterval(() => {
  const now = Date.now();
  const resetTime = getNextSaturdayMidnightUTC();
  const resetFile = path.join(__dirname, "last_reset.json");

  let lastReset = 0;
  if (fs.existsSync(resetFile)) {
    lastReset = JSON.parse(fs.readFileSync(resetFile, "utf8")).lastReset;
  }

  if (now >= resetTime && lastReset < resetTime) {
    archiveLeaderboard();
    fetchData();
    fs.writeFileSync(resetFile, JSON.stringify({ lastReset: now }));
    console.log("Leaderboard reset and archived.");
  }
}, 60000);

// Fetch data every 5 minutes (Fixed duplicate interval issue)
setInterval(fetchData, 300000);

// API Endpoints
app.get("/leaderboard", (req, res) => {
  const filePath = path.join(__dirname, "summarized_bets.json");
  if (fs.existsSync(filePath)) {
    res.json(JSON.parse(fs.readFileSync(filePath, "utf8")));
  } else {
    res.status(404).json({ error: "Leaderboard not found" });
  }
});

app.get("/previous-leaderboards", (req, res) => {
  const filePath = path.join(__dirname, "previous_leaderboards.json");
  if (fs.existsSync(filePath)) {
    res.json(JSON.parse(fs.readFileSync(filePath, "utf8")));
  } else {
    res.status(404).json({ error: "No archived leaderboards found" });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  fetchData(); // Initial fetch on server start
});
