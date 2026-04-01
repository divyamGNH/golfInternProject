import { useState } from "react";
import axios from "axios";

const Admin = ({ user }) => {
  const [isTriggering, setIsTriggering] = useState(false);
  const [winnerScores, setWinnerScores] = useState([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const handleTriggerLottery = async () => {
    setMessage("");
    setError("");

    try {
      setIsTriggering(true);

      const response = await axios.post(
        "http://localhost:3000/api/lottery/draw-weighted",
        {},
        { withCredentials: true }
      );

      const scores = response.data?.winner?.scores || [];
      setWinnerScores(scores.slice(0, 5));
      setMessage("Lottery triggered successfully.");
    } catch (err) {
      const backendMessage =
        err.response?.data?.message || "Unable to trigger lottery right now.";
      setError(backendMessage);
      setWinnerScores([]);
    } finally {
      setIsTriggering(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 px-4 py-8 sm:px-6">
      <div className="mx-auto w-full max-w-2xl rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <h1 className="text-2xl font-semibold text-slate-900">Admin Panel</h1>
        <p className="mt-2 text-sm text-slate-600">
          Welcome, {user?.email}. You have admin access.
        </p>

        <button
          onClick={handleTriggerLottery}
          disabled={isTriggering}
          className="mt-5 rounded-xl bg-slate-900 px-5 py-2.5 font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {isTriggering ? "Triggering..." : "Trigger Lottery"}
        </button>

        {message && (
          <p className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            {message}
          </p>
        )}

        {error && (
          <p className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </p>
        )}

        <div className="mt-6">
          <h2 className="text-lg font-semibold text-slate-900">Winner 5 Scores</h2>

          {winnerScores.length === 0 ? (
            <p className="mt-2 text-sm text-slate-600">No draw result yet.</p>
          ) : (
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
              {winnerScores.map((score, index) => (
                <div
                  key={`${score}-${index}`}
                  className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-center text-sm font-medium text-slate-800"
                >
                  {score}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Admin;
