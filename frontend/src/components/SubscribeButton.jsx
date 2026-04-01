import { useState } from "react";
import axios from "axios";

export default function SubscribeButton() {
  const [loading, setLoading] = useState(false);

  const handleSubscribe = async () => {
    try {
      setLoading(true);

      const res = await axios.post(
        "http://localhost:3000/api/payments/create-checkout-session",
        {},
        { withCredentials: true }
      );

      const data = res.data;
      if (!data?.url) {
        throw new Error(data?.error || "Something went wrong");
      }

      // redirect to Stripe Checkout
      window.location.href = data.url;
    } catch (err) {
      console.log(err);
      console.error("Payment error:", err.message);
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleSubscribe}
      disabled={loading}
      className={`px-6 py-3 rounded-xl text-white transition-all duration-200 ${
        loading
          ? "bg-gray-500 cursor-not-allowed"
          : "bg-black hover:bg-gray-800"
      }`}
    >
      {loading ? "Redirecting..." : "Subscribe Now"}
    </button>
  );
}