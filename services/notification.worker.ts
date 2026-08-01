import cron from "node-cron";
import NotificationQueue from "../models/NotificationQueue.model.js";
import Device from "../models/Device.model.js";
import admin from "../config/firebase.config.js";

const MAX_RETRIES = 5;

/**
 * Calculate next retry time using exponential backoff
 * Retry intervals approx: 1m, 2m, 4m, 8m, 16m
 */
const getNextRetryTime = (retryCount: number): Date => {
    const now = new Date();
    const delayMinutes = Math.pow(2, retryCount); // 2^0 = 1m, 2^1 = 2m, etc.
    return new Date(now.getTime() + delayMinutes * 60000);
};

export const registerNotificationWorker = () => {
    // Run every 1 minute
    cron.schedule("* * * * *", async () => {
        try {
            // Find all pending or failed (but retriable) notifications that are due
            const jobs = await NotificationQueue.find({
                status: { $in: ["pending", "failed"] },
                nextRetryAt: { $lte: new Date() },
                retryCount: { $lt: MAX_RETRIES }
            }).limit(100); // Process in batches of 100

            if (jobs.length === 0) return;

            // Mark them as processing to prevent concurrent workers from picking them up
            const jobIds = jobs.map(j => j._id);
            await NotificationQueue.updateMany(
                { _id: { $in: jobIds } },
                { $set: { status: "processing" } }
            );

            for (const job of jobs) {
                try {
                    // Get user's FCM tokens
                    const devices = await Device.find({ user: job.userId });
                    
                    if (devices.length === 0) {
                        // User has no devices, mark as success since we can't do anything
                        job.status = "success";
                        job.errorLog.push(`[${new Date().toISOString()}] No devices found for user.`);
                        await job.save();
                        continue;
                    }

                    const tokens = devices.map(d => d.fcmToken);

                    // Send via Firebase
                    const response = await admin.messaging().sendEachForMulticast({
                        tokens,
                        notification: { title: job.title, body: job.body },
                        data: { type: job.type, ...(job.data || {}) },
                        android: { priority: "high" },
                        apns: { payload: { aps: { sound: "default" } } },
                    });

                    // Handle stale tokens
                    const staleTokens: string[] = [];
                    response.responses.forEach((res, idx) => {
                        if (!res.success) {
                            const code = res.error?.code;
                            if (
                                code === "messaging/invalid-registration-token" ||
                                code === "messaging/registration-token-not-registered"
                            ) {
                                staleTokens.push(tokens[idx]);
                            }
                        }
                    });

                    if (staleTokens.length > 0) {
                        await Device.deleteMany({ user: job.userId, fcmToken: { $in: staleTokens } });
                        console.log(`[ECD Queue] Removed ${staleTokens.length} stale token(s) for user ${job.userId}`);
                    }

                    // Check if it was entirely a failure (no successful sends)
                    // If at least one succeeded, we consider the job a success
                    if (response.successCount > 0) {
                        job.status = "success";
                        console.log(`[ECD Queue] Sent "${job.title}" to user ${job.userId}`);
                    } else {
                        // All tokens failed but maybe not stale (e.g. timeout)
                        throw new Error("All tokens failed to send. " + JSON.stringify(response.responses));
                    }
                } catch (err: any) {
                    console.error(`[ECD Queue] Failed to process job ${job._id}:`, err.message);
                    job.retryCount += 1;
                    job.errorLog.push(`[${new Date().toISOString()}] Error: ${err.message}`);
                    
                    if (job.retryCount >= MAX_RETRIES) {
                        job.status = "failed"; // permanently failed
                    } else {
                        job.status = "failed"; // will be picked up again
                        job.nextRetryAt = getNextRetryTime(job.retryCount - 1);
                    }
                }

                // Save job result
                await job.save();
            }
        } catch (error) {
            console.error("[ECD Queue] Worker error:", error);
        }
    });

    console.log("[ECD Queue] Notification worker registered (runs every minute)");
};
