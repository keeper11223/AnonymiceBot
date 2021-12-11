/*##############################################################################
# File: syncronizer.js                                                         #
# Project: Anonymice - Discord Bot                                             #
# Author(s): Oliver Renner (@_orenner) & slingn.eth (@slingncrypto)            #
# © 2021                                                                       #
###############################################################################*/

require("./utils/arrays");
const config = require("./config");
const path = require("path");
const loggerFactory = require("./utils/loggerFactory");

const SyncLog = require("./db/models/syncLog");
const User = require("./db/models/user");

const DiscordBot = require("./discordBot");
const ruleExecutor = require("./rules/RuleExecutor");
const settings = require("../settings");

/**
 * Synchronizes the roles assigned to users ever N minutes as defined in the
 * SYNC_INTERVAL_IN_MINUTES .env variable
 */
class Synchronizer {
  /**
   * Starts a scheduled task which will refresh/synchronize user roles against
   * the verified users wallet/holdings every N minutes as defined in the
   * SYNC_INTERVAL_IN_MINUTES .env variable
   */
  start() {
    const logDir = path.join(__dirname, "../log");
    const logger = loggerFactory.create(logDir, "sync.txt", "sync");

    logger.info("Starting Syncronizer...");

    const configuredNumberOfMinutes =
      parseInt(config.sync.numberOfMinutes) || 1;
    const schedule = configuredNumberOfMinutes * 60000;

    const firstExecutionTime = new Date(new Date().getTime() + schedule);
    logger.info(
      `Syncronizer will run every ${configuredNumberOfMinutes} minutes. First execution will start at ${this.toLocaleFormat(
        firstExecutionTime
      )}`
    );

    // re-verify roles

    this.interval = setInterval(async () => {
      const syncLog = new SyncLog();
      let now = new Date();
      syncLog.startTime = now;

      logger.info(
        `Syncronizer iteration starting: ${this.toLocaleFormat(now)}.`
      );

      let cutoff = new Date(new Date().getTime() - schedule);
      logger.info(
        `Searching for users who have not reverified since ${this.toLocaleFormat(
          cutoff
        )}`
      );

      //retrieve the users from the db whos last verification is older than the cutoff
      const dbUsers = await User.find({
        lastVerified: { $lte: cutoff },
      }).exec();

      let configuredRoles = new Set(settings.rules.map((r) => r.roleId));

      const guild = DiscordBot.getGuild(process.env.DISCORD_GUILD_ID);
      const discordRoles = await guild.roles.fetch();
      const rolesToProcess = discordRoles.filter((role) => {
        if (configuredRoles.has(role.id)) {
          return role;
        }
      });
      let allMembers = [];
      rolesToProcess.forEach((role) => {
        allMembers.push(role.members);
      });

      if(!allMembersByRole.length) {
        logger.info(
          `There are no users who need reverification since ${this.toLocaleFormat(cutoff)}`
        );
        return;
      }

      dbUsers.forEach(async (user) => {
        const discordUser = await guild.members.fetch(user.userId);

        logger.info(
          `Reverifying user: ${discordUser.displayName} (${discordUser.nickname}) using wallet ${user.walletAddress}`
        );

        let results = await ruleExecutor.run(user);
        
        
        syncLog.save();
      });
    }, schedule); // daily
  }

  /**
   * Stops the scheduled task
   */
  stop() {
    if (this.interval) {
      clearInterval(this.interval);
    }
  }

  toLocaleFormat(dt) {
    return `${dt.toLocaleDateString()} ${dt.toLocaleTimeString()}`;
  }
}

module.exports = new Synchronizer();