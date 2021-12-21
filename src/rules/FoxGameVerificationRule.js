const logger = require("../utils/logger");
const discordBot = require("../discordBot");

/**
 * Anonymice specific Verification Rule - checks whether users should be assigned Genesis Mice, Baby Mice and
 * Alpha Mice roles based on their holdings. Checks for Mice held in the Users wallet, staked for CHEETH
 * or incubating babies in the breeding process.
 */
class FoxGameVerificationRule {
  constructor(config) {
    this.config = config;
    this.logger = require("../utils/logger");
    this.axios = require("axios").default;
  }

  async execute(discordUser, role, result) {
    //  note:   this rule is customized to allow for more than one role assignment so we
    //          can ignore the fact that no specific role has been passed in

    let executionResults = [];

    let discordRoles = await this.getDiscordRoles(this.config.roles);

    //wrapping each role we are executing on in its own try/catch
    //if any one fails, others will still be processed

    try {
      //gen 0
      let gen0RoleConfig = this.config.roles.find((r) => r.name === "Gen0");
      let gen0Role = discordRoles.find((r) => r.id === gen0RoleConfig.id);
      let qualifiesForGen0 = result.gen0.length > 0;
      await this.manageRoles(
        discordUser, // discord user
        gen0Role, //guild instance
        qualifiesForGen0
      );
      executionResults.push({
        role: "Gen0",
        roleId: gen0Role.id,
        qualified: qualifiesForGen0,
        result: {
          gen0: result.gen0,
        },
      });
    } catch (err) {
      logger.error(err.message);
      logger.error(err.stack);
    }
    try {
      //gen1
      let gen1RoleConfig = this.config.roles.find((r) => r.name === "Gen1");
      let gen1Role = discordRoles.find((r) => r.id === gen1RoleConfig.id);
      let qualifiesForGen1 = result.gen1.length > 0;
      await this.manageRoles(
        discordUser, // discord user
        gen1Role, //guild instance
        qualifiesForGen1
      );
      executionResults.push({
        role: "Gen1",
        roleId: gen1Role.id,
        qualified: qualifiesForGen1,
        result: {
          gen1: result.gen1,
        },
      });
    } catch (err) {
      logger.error(err.message);
      logger.error(err.stack);
    }

    return executionResults;
  }

  async check(user) {
    let queryResults = await this.getResults(this.config, user);

    let gen0Result = this.getGen0(queryResults);
    let gen1Result = this.getGen1(queryResults);

    let result = {
      gen0: gen0Result,
      gen1: gen1Result,
    };
    return result;
  }

  getGen0(currentUser) {
    let ownedTokens = currentUser.ownedTokens.filter((t) => t.id && t.id < 10000);
    let stakedTokens = currentUser.stakedTokens.filter((t) => t.id && t.id < 10000);
    return [...ownedTokens, ...stakedTokens];
  }

  getGen1(currentUser) {
    let ownedTokens = currentUser.ownedTokens.filter((t) => t.id && t.id >= 10000);
    let stakedTokens = currentUser.stakedTokens.filter((t) => t.id && t.id >= 10000);
    return [...ownedTokens, ...stakedTokens];
  }

  async getDiscordRoles(rolesConfig) {
    let guild = discordBot.getGuild();
    let roles = [];
    //retrieve each of the discord roles defined in the config
    await rolesConfig.forEachAsync(async (r) => {
      let role = await guild.roles.fetch(r.id, { force: true });
      if (!role) {
        logger.error(
          `Could not find the role id configured for ${r.name}. Please confirm your configuration.`
        );
        return;
      }
      roles.push(role);
    });

    return roles;
  }

  async getResults(config, user) {
    let logMessage = `FoxGame Verification Rule is executing - Get Results from Graph:
Endpoing:       ${config.endpoint}
Argument(s):    ${user.walletAddress}`;

    if (!user.walletAddress) {
      logMessage += `
Wallet Address is null/empty. Skipping check against graph and returning 0.`;
      logger.info(logMessage);
      return 0;
    }

    //make request for gen0
    let query = `
    {
      currentUser: user(id: "${user.walletAddress.toLowerCase()}") {
        ownedTokens {
          id
        }
        stakedTokens {
          id
        }
      }
    }`;
    let defaultResult = { ownedTokens: [], stakedTokens: [] };
    let response = await this.makeRequest(this.config.endpoint, query);
    if (response.status !== 200) {
      logger.error(
        `There was an error querying the endpoint: ${this.config.endpoint} using data ${query}`
      );
      logger.error(response.statusText);
      return defaultResult; //todo set response structure default
    }

    let result = response.data.data.currentUser || defaultResult;

    logMessage += `
Result:       ${JSON.stringify(result)}`;
    logger.info(logMessage);

    return result;
  }

  async makeRequest(url, query) {
    let axios = require("axios");
    return await axios.post(url, {
      query: query,
    });
  }

  //todo: cleanup return values arent consumed

  async manageRoles(discordUser, role, qualifies) {
    if (!role) {
      logger.error(
        `Could not locate the ${roleName} discord role using id ${roleId} specified. Please confirm your configuration.`
      );
      return false;
    }

    try {
      if (qualifies) {
        if (!discordUser.roles.cache.has(role.id)) {
          logger.info(`Assigning Role: ${role.name}`);
          await discordUser.roles.add(role);
        }
        return true;
      } else {
        if (discordUser.roles.cache.has(role.id)) {
          logger.info(`Removing Role: ${role.name}`);
          await discordUser.roles.remove(role);
        }
        return false;
      }
    } catch (err) {
      logger.error(err.message);
      logger.error(err.stack);
    }
  }
}

module.exports = FoxGameVerificationRule;
