import { AppError } from '../errors.js';

export class MatterService {
  constructor(repository, options = {}) {
    if (!repository) throw new TypeError('MatterService requires a repository.');
    this.repository = repository;
    this.searchResultService = typeof options?.getSearchResult === 'function'
      ? options
      : (options?.searchResultService ?? null);
  }

  async createMatter({ firmId, createdByUserId, input }) {
    return this.repository.create({
      firmId,
      createdByUserId,
      name: input.name,
      clientRef: input.clientRef,
    });
  }

  async getMatter({ firmId, id }) {
    const matter = await this.repository.findById({ firmId, id });
    if (!matter) throw new AppError(404, 'MATTER_NOT_FOUND', 'Matter not found.');
    return matter;
  }

  async listMatters({ firmId, page, pageSize }) {
    return this.repository.listByFirm({ firmId, page, pageSize });
  }

  async saveRiskResult({ firmId, matterId, createdByUserId, input }) {
    const matter = await this.getMatter({ firmId, id: matterId });
    if (!this.searchResultService || typeof this.searchResultService.getSearchResult !== 'function') {
      throw new AppError(500, 'MATTER_SERVICE_UNCONFIGURED', 'SearchResultService is required for matter risk result persistence.');
    }
    const searchSnapshot = await this.searchResultService.getSearchResult({
      firmId,
      searchResultId: input.searchId,
    });
    const candidate = searchSnapshot.results.find((c) => c.id === input.candidateResultId);
    if (!candidate) {
      throw new AppError(404, 'CANDIDATE_RESULT_NOT_FOUND', 'Candidate result not found in search snapshot.');
    }
    const saved = await this.repository.addRiskResult({
      firmId,
      matterId: matter.id,
      createdByUserId,
      searchResultId: input.searchId,
      candidateMarkText: candidate.candidateMarkText,
      riskScoreSnapshot: candidate.riskAnalysis,
    });
    const updatedMatter = await this.getMatter({ firmId, id: matterId });
    return {
      matter: updatedMatter,
      savedResult: saved,
    };
  }

  async linkOfficeActionRef({ firmId, matterId, createdByUserId, officeActionRefId }) {
    const matter = await this.getMatter({ firmId, id: matterId });
    if (!matter) throw new AppError(404, 'MATTER_NOT_FOUND', 'Matter not found.');
    return this.repository.addOfficeActionRef({
      firmId,
      matterId,
      officeActionRefId,
      createdByUserId,
    });
  }

  async listOfficeActionRefs({ firmId, matterId }) {
    const matter = await this.getMatter({ firmId, id: matterId });
    if (!matter) throw new AppError(404, 'MATTER_NOT_FOUND', 'Matter not found.');
    return this.repository.listOfficeActionRefs({ firmId, matterId });
  }
}
