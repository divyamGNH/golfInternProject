import SubscribeButton from "./SubscribeButton";
import { Link } from "react-router-dom";

const Dashboard = ({ user }) => {
  return (
    <div className="min-h-screen bg-slate-100 px-4 py-8 sm:px-6">
      <div className="mx-auto w-full max-w-2xl rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <h1 className="text-2xl font-semibold text-slate-900">Dashboard</h1>
        <p className="mt-2 text-sm text-slate-600">
          Logged in as {user?.email} ({user?.role || "user"})
        </p>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <SubscribeButton />
          <Link
            to="/lottery"
            className="rounded-xl border border-slate-300 px-5 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            Go to Lottery
          </Link>
          {user?.role === "admin" && (
            <Link
              to="/admin"
              className="rounded-xl border border-slate-300 px-5 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              Admin Panel
            </Link>
          )}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
