import LotteryScore from "../models/LotteryScore.js";

const buildScoreFrequency = (scores) => {
  const frequency = new Map();

  for (const score of scores) {
    frequency.set(score, (frequency.get(score) || 0) + 1);
  }

  return Array.from(frequency.values());
};

const computeHybridWeight = (scores) => {
  const counts = buildScoreFrequency(scores);

  if (counts.length === 0) {
    return 0;
  }

  const mostFrequentCount = Math.max(...counts);
  const leastFrequentCount = Math.min(...counts);

  // Hybrid weight: favor repeated consistency while still considering rare values.
  const weight = mostFrequentCount + 1 / leastFrequentCount;

  return {
    weight,
    mostFrequentCount,
    leastFrequentCount,
  };
};

const pickWeightedWinner = (candidates) => {
  const totalWeight = candidates.reduce((sum, user) => sum + user.weight, 0);

  if (totalWeight <= 0) {
    return null;
  }

  let randomPoint = Math.random() * totalWeight;

  for (const user of candidates) {
    randomPoint -= user.weight;
    if (randomPoint <= 0) {
      return user;
    }
  }

  return candidates[candidates.length - 1];
};

export const getScores = async (req, res) => {
  const userId = req.user?.userId;

  if (!userId) {
    return res.status(401).json({ message: "User is not authorized." });
  }

  try {
    const userScores = await LotteryScore.findOne({ userId })
      .select("userId scores")
      .lean();

    return res.status(200).json({
      userId,
      scores: userScores?.scores || [],
    });
  } catch (error) {
    console.error("Error fetching scores:", error);
    return res.status(500).json({
      message: "Error fetching scores.",
      error: error.message,
    });
  }
};

export const submitScore = async (req, res) => {
  const { score, scores } = req.body;
  const userId = req.user?.userId;

  if (!userId) {
    return res.status(401).json({ message: "User is not authorized." });
  }

  const incomingScores = Array.isArray(scores)
    ? scores
    : score !== undefined
    ? [score]
    : [];

  if (incomingScores.length === 0) {
    return res
      .status(400)
      .json({ message: "Provide score (number) or scores (number[])." });
  }

  const invalidScore = incomingScores.find(
    (s) => typeof s !== "number" || Number.isNaN(s)
  );

  if (invalidScore !== undefined) {
    return res.status(400).json({ message: "All scores must be valid numbers." });
  }

  try {
    await LotteryScore.updateOne(
      { userId },
      {
        $push: {
          scores: {
            $each: incomingScores,
            $slice: -5,
          },
        },
      },
      {
        upsert: true,
        setDefaultsOnInsert: true,
      }
    );

    const userScores = await LotteryScore.findOne({ userId })
      .select("userId scores")
      .lean();

    return res.status(200).json({
      message: "Score submitted successfully.",
      userId,
      scores: userScores?.scores || [],
    });
  } catch (error) {
    console.error("Error submitting score:", error);
    return res.status(500).json({
      message: "Error submitting score.",
      error: error.message,
    });
  }
};

export const runWeightedLottery = async (req, res) => {
  try {
    const usersWithScores = await LotteryScore.find({
      scores: { $exists: true, $not: { $size: 0 } },
    })
      .select("userId scores")
      .lean();

    if (usersWithScores.length === 0) {
      return res.status(400).json({
        message: "No users with scores available for lottery draw.",
      });
    }

    const candidates = usersWithScores
      .map((entry) => {
        const metrics = computeHybridWeight(entry.scores || []);

        if (!metrics || metrics.weight <= 0) {
          return null;
        }

        return {
          userId: entry.userId,
          scores: entry.scores,
          weight: Number(metrics.weight.toFixed(4)),
          mostFrequentCount: metrics.mostFrequentCount,
          leastFrequentCount: metrics.leastFrequentCount,
        };
      })
      .filter(Boolean);

    if (candidates.length === 0) {
      return res.status(400).json({
        message: "No eligible candidates found for weighted lottery.",
      });
    }

    const winner = pickWeightedWinner(candidates);

    return res.status(200).json({
      message: "Weighted lottery draw completed successfully.",
      algorithm: "hybrid-most-least-frequency",
      winner,
      totalCandidates: candidates.length,
      candidates,
    });
  } catch (error) {
    console.error("Error running weighted lottery:", error);
    return res.status(500).json({
      message: "Error running weighted lottery.",
      error: error.message,
    });
  }
};
