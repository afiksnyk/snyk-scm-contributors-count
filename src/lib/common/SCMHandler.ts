import * as ora from 'ora';
import {
  dedupRepos,
  dedupContributorsByEmail,
  excludeFromListByEmail,
  calculateSummaryStats,
  printOutResults,
} from '.';
import { ContributorMap } from '../types';
import { retrieveMonitoredRepos, SourceType } from '../snyk';
import * as debugLib from 'debug';

const debug = debugLib('snyk:scm-handler');

export abstract class SCMHandlerClass {
  dedupRepos = dedupRepos;
  dedupContributorsByEmail = dedupContributorsByEmail;
  excludeFromListByEmail = excludeFromListByEmail;
  retrieveMonitoredRepos = retrieveMonitoredRepos;
  calculateSummaryStats = calculateSummaryStats;
  printOutResults = printOutResults;
  SourceType = SourceType;

  abstract fetchSCMContributors(
    snykMonitoredRepos?: string[],
  ): Promise<ContributorMap>;

  scmContributorCount = async (
    url: string,
    sourceType: SourceType,
    skipSnykMonitoredRepos: boolean,
    exclusionFilePath: string,
    json: boolean,
  ) => {
    let isQuiet = false;
    if (process.env.DEBUG) {
      debug('DEBUG MODE ENABLED \n');
      isQuiet = true;
    } else if (json) {
      isQuiet = true;
    }

    const spinner = ora({ isSilent: isQuiet });
    debug('Loading snyk monitored repos list \n');
    // TODO: Add option to set this to empty array when we want to count irrespective of what's in snyk

    spinner.start();
    spinner.text = 'Loading snyk monitored repos list';

    let snykImportedRepos: string[] = [];
    if (!skipSnykMonitoredRepos) {
      snykImportedRepos = await this.retrieveMonitoredRepos(url, sourceType);
      spinner.succeed();

      spinner.start();
      spinner.text = 'Removing monitored repository duplicates';
      debug('Removing monitored repository duplicates');
      const deduppedSnykImportedRepos = this.dedupRepos(snykImportedRepos);
      debug(deduppedSnykImportedRepos);
      spinner.succeed();
    }

    spinner.start();
    debug('Retrieving projects from Bitbucket server \n');
    spinner.text =
      'Retrieving projects from Bitbucket server with commits in last 90 days';

    let contributors = (await this.fetchSCMContributors(
      snykImportedRepos,
    )) as ContributorMap;
    spinner.succeed();

    spinner.start();
    spinner.text = 'Removing duplicate contributors';
    debug('Contributors before exclusion');
    contributors = this.dedupContributorsByEmail(contributors);
    const contributorsCountBeforeExclusion = contributors.size;
    debug(contributors);
    spinner.succeed();

    if (exclusionFilePath) {
      spinner.start();
      spinner.text = 'Applying exclusion list ';
      contributors = this.excludeFromListByEmail(
        contributors,
        exclusionFilePath,
      );
      debug('Contributors after exclusion list');
      debug(contributors);
      spinner.succeed();
    }

    const contributorsCountAfterExclusion = contributors.size;
    const outputResults = this.calculateSummaryStats(
      contributors,
      contributorsCountBeforeExclusion - contributorsCountAfterExclusion,
    );
    debug('Output results');
    debug(outputResults);
    this.printOutResults(outputResults, json);
  };
}
