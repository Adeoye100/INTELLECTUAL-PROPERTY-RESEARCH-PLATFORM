import { AppError } from '../errors.js';

export class MatterService {
  constructor(repository) {
    if (!repository) throw new TypeError('MatterService requires a repository.');
    this.repository = repository;
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
    const saved = await this.repository.addRiskResult({
      firmId,
      matterId: matter.id,
      createdByUserId,
      searchResultId: input.searchResultId,
      candidateMarkText: input.candidateMarkText,
      riskScoreSnapshot: input.riskScoreSnapshot,
    });
    const updatedMatter = await this.getMatter({ firmId, id: matterId });
    return {
      matter: updatedMatter,
      savedResult: saved,
    };
  }
}
