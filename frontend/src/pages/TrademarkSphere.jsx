import React, { useState } from "react";
import axios from "axios";

import TrademarkSearchPanel from "../components/trademark/TrademarkSearchPanel";
import TrademarkResultCard from "../components/trademark/TrademarkResultCard";

import TrademarkTimeline from "../components/trademark/TrademarkTimeline";
import TrademarkWatchlist from "../components/trademark/TrademarkWatchlist";
import TrademarkSimilarityPanel from "../components/trademark/TrademarkSimilarityPanel";


export default function TrademarkSphere() {

  const [applicationNumber, setApplicationNumber] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  const syncTrademark = async () => {

    if (!applicationNumber) return;

    setLoading(true);

    try {

      const response = await axios.post(
        `/trademark-sphere/sync/${applicationNumber}`
      );

      setResult(response.data);

    } catch (err) {

      setError(
        err?.response?.data?.detail ||
        "Scraping failed"
      );

    } finally {

      setLoading(false);

    }
  };

  return (
    <div className="p-6 bg-gray-100 min-h-screen">

      <div className="max-w-7xl mx-auto">

        <div className="mb-6 flex items-center justify-between">

          <div>
            <h1 className="text-3xl font-bold">
              Trademark Sphere
            </h1>

            <div className="text-gray-500 mt-1">
              Production Trademark Intelligence Engine
            </div>
          </div>

          <div className="bg-green-100 text-green-700 px-4 py-2 rounded-full text-sm">
            Scraper Active
          </div>

        </div>

        <TrademarkSearchPanel
          applicationNumber={applicationNumber}
          setApplicationNumber={setApplicationNumber}
          syncTrademark={syncTrademark}
          loading={loading}
        />

        {error && (
          <div className="bg-red-100 text-red-700 rounded-xl p-4 mb-4">
            {error}
          </div>
        )}

        <TrademarkResultCard result={result} />

        <TrademarkTimeline />

        <TrademarkSimilarityPanel />

        <TrademarkWatchlist />


      </div>

    </div>
  );
}
