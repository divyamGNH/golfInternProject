import { useState } from "react";
import axios from "axios";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

const Lottery = () => {
  const [score, setScore] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const queryClient = useQueryClient();

  const {
    data: scores = [],
    isLoading: isLoadingScores,
    error: fetchError,
  } = useQuery({
    queryKey: ["lottery-scores"],
    queryFn: async () => {
      const response = await axios.get("http://localhost:3000/api/lottery/scores", {
        withCredentials: true,
      });
      return response.data?.scores || [];
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const submitScoreMutation = useMutation({
    mutationFn: async (parsedScore) => {
      const response = await axios.post(
        "http://localhost:3000/api/lottery/submit-score",
        { score: parsedScore },
        { withCredentials: true }
      );
      return response.data?.scores || [];
    },
    onSuccess: (updatedScores) => {
      queryClient.setQueryData(["lottery-scores"], updatedScores);
      setMessage("Score submitted. Latest 5 scores updated.");
      setScore("");
    },
    onError: (err) => {
      const backendMessage =
        err.response?.data?.message || "Unable to submit score right now.";
      setError(backendMessage);
    },
  });

  const handleSubmitScore = async (e) => {
    e.preventDefault();
    setMessage("");
    setError("");

    const parsedScore = Number(score);

    if (score === "" || Number.isNaN(parsedScore)) {
      setError("Please enter a valid numeric score.");
      return;
    }

    submitScoreMutation.mutate(parsedScore);
  };

  const resolvedFetchError =
    fetchError?.response?.data?.message ||
    (fetchError ? "Unable to load scores right now." : "");

  return (
    <div className="min-h-screen bg-slate-100 px-4 py-8 sm:px-6">
      <div className="mx-auto w-full max-w-2xl rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="mb-6 flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
              Lottery
            </p>
            <h1 className="text-2xl font-semibold text-slate-900 sm:text-3xl">
              Submit Golf Scores
            </h1>
          </div>
          <Link
            to="/dashboard"
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Back to Home
          </Link>
        </div>

        <form onSubmit={handleSubmitScore} className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="score" className="block text-sm font-medium text-slate-700">
              Enter score
            </label>
            <input
              id="score"
              type="number"
              value={score}
              onChange={(e) => setScore(e.target.value)}
              placeholder="e.g. 72"
              className="w-full rounded-xl border border-slate-300 px-4 py-2.5 outline-none transition focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100"
            />
          </div>

          <button
            type="submit"
            disabled={submitScoreMutation.isPending}
            className="rounded-xl bg-slate-900 px-5 py-2.5 font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {submitScoreMutation.isPending ? "Submitting..." : "Submit score"}
          </button>
        </form>

        {message && (
          <p className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            {message}
          </p>
        )}

        {(error || resolvedFetchError) && (
          <p className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error || resolvedFetchError}
          </p>
        )}

        <div className="mt-7">
          <h2 className="text-lg font-semibold text-slate-900">Latest 5 scores</h2>

          {scores.length === 0 ? (
            isLoadingScores ? (
              <p className="mt-2 text-sm text-slate-600">Loading scores...</p>
            ) : (
            <p className="mt-2 text-sm text-slate-600">
              No scores submitted yet.
            </p>
            )
          ) : (
            <ul className="mt-3 space-y-2">
              {scores.map((value, index) => (
                <li
                  key={`${value}-${index}`}
                  className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800"
                >
                  Score {index + 1}: {value}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
};

export default Lottery;
