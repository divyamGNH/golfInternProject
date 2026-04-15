const checkoutJobs = [];
let isProcessing = false;
let nextJobId = 1;

const logQueue = (message, details = {}) => {
  const payload = {
    depth: checkoutJobs.length + (isProcessing ? 1 : 0),
    waiting: checkoutJobs.length,
    processing: isProcessing,
    ...details,
  };
  console.log(`[checkout-queue] ${message}`, payload);
};

const processNext = () => {
  if (isProcessing || checkoutJobs.length === 0) {
    return;
  }

  isProcessing = true;
  const job = checkoutJobs.shift();
  logQueue("job-started", {
    jobId: job.jobId,
    userId: job.userId,
    eventId: job.eventId,
  });

  Promise.resolve()
    .then(job.handler)
    .then((result) => {
      if (!job.isSettled) {
        job.isSettled = true;
        logQueue("job-completed", {
          jobId: job.jobId,
          userId: job.userId,
          eventId: job.eventId,
        });
        job.resolve(result);
      }
    })
    .catch((error) => {
      if (!job.isSettled) {
        job.isSettled = true;
        logQueue("job-failed", {
          jobId: job.jobId,
          userId: job.userId,
          eventId: job.eventId,
          reason: error?.message || "Unknown queue error",
        });
        job.reject(error);
      }
    })
    .finally(() => {
      isProcessing = false;
      setImmediate(processNext);
    });
};

export const enqueueCheckoutJob = (handler, options = {}) => {
  const timeoutMs = Number(options.timeoutMs || 45000);
  const userId = String(options.userId || "unknown");
  const eventId = String(options.eventId || "unknown");

  return new Promise((resolve, reject) => {
    const job = {
      jobId: nextJobId++,
      userId,
      eventId,
      handler,
      resolve,
      reject,
      isSettled: false,
    };

    checkoutJobs.push(job);
    logQueue("job-enqueued", {
      jobId: job.jobId,
      userId: job.userId,
      eventId: job.eventId,
      timeoutMs,
    });

    setTimeout(() => {
      if (!job.isSettled) {
        job.isSettled = true;
        logQueue("job-timeout", {
          jobId: job.jobId,
          userId: job.userId,
          eventId: job.eventId,
          timeoutMs,
        });
        reject(new Error("Checkout request timed out while waiting in queue."));
      }
    }, timeoutMs);

    processNext();
  });
};

export const getCheckoutQueueDepth = () => checkoutJobs.length + (isProcessing ? 1 : 0);

export const getCheckoutQueueSnapshot = () => ({
  depth: checkoutJobs.length + (isProcessing ? 1 : 0),
  waiting: checkoutJobs.length,
  processing: isProcessing,
  pendingJobs: checkoutJobs.map((job) => ({
    jobId: job.jobId,
    userId: job.userId,
    eventId: job.eventId,
  })),
});
