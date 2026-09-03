import Notification from "../models/Notification.model.js";
import { emitAdminNotification } from "../socket/orderSocket.js";

export type AdminNotificationCategory =
  | "order"
  | "issue"
  | "review"
  | "menu_approval"
  | "withdrawal"
  | "general";

export interface CreateAdminNotificationParams {
  title: string;
  body: string;
  category: AdminNotificationCategory;
  data?: Record<string, any>;
}

export async function createAndEmitAdminNotification({
  title,
  body,
  category,
  data = {},
}: CreateAdminNotificationParams) {
  try {
    const notification = await Notification.create({
      forAdmin: true,
      title,
      body,
      type: category,
      data,
      read: false,
    });

    const payload = notification.toObject ? notification.toObject() : notification;
    emitAdminNotification(payload);
    return notification;
  } catch (err) {
    console.error("[AdminNotificationService] Error creating notification:", err);
    return null;
  }
}
