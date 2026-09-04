export class AlertNotificationService {
  constructor({ mailer = null, redisClient = null, digestIntervalMinutes = 60 } = {}) {
    this.mailer = mailer;
    this.redisClient = redisClient;
    this.digestIntervalMinutes = Number.isSafeInteger(digestIntervalMinutes) && digestIntervalMinutes > 0
      ? digestIntervalMinutes
      : 60;
  }

  async notifyAlert({ watch, alert, recipientEmail }) {
    const channel = watch?.alertChannel ?? watch?.alert_channel ?? 'in-app';
    const mode = watch?.alertMode ?? watch?.alert_mode ?? 'real-time';

    const deliveryRecord = {
      alertId: alert.id,
      watchId: watch?.id ?? alert.watchId,
      channel,
      mode,
      deliveredAt: new Date().toISOString(),
    };

    if (channel === 'in-app') {
      return { ...deliveryRecord, status: 'delivered_in_app' };
    }

    if (channel === 'email') {
      if (mode === 'real-time') {
        if (this.mailer && typeof this.mailer.sendAlertEmail === 'function' && recipientEmail) {
          await this.mailer.sendAlertEmail({
            to: recipientEmail,
            subject: `[IPRP Alert] Trademark Conflict Detected: ${alert.matchedMarkText || alert.candidateMarkText}`,
            alert,
          });
          return { ...deliveryRecord, status: 'delivered_email_realtime' };
        }
        return { ...deliveryRecord, status: 'email_simulated' };
      }

      if (mode === 'digest' && this.redisClient && typeof this.redisClient.rpush === 'function') {
        const key = `alert_digest:${watch.firmId}:${watch.id}`;
        await this.redisClient.rpush(key, JSON.stringify(alert));
        if (typeof this.redisClient.expire === 'function') {
          await this.redisClient.expire(key, this.digestIntervalMinutes * 60);
        }
        return { ...deliveryRecord, status: 'queued_digest' };
      }
    }

    return { ...deliveryRecord, status: 'processed' };
  }
}
