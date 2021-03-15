import { ComputationKind } from "@prisma/client";
import {
  DatasetListingApiSuccessResponse,
  mpc,
  NewSession,
  SessionId,
} from "@sine-fdn/sine-ts";
import ApiNewDatasetSession from "../services/ApiNewDatasetSession.service";

/**
 * performs the MPC protocol against a single dimension
 * @param jiff_instance low-level MPC connection
 * @param secretInput user-level input vector (to remain secret)
 */
async function benchmarkingProtocolDelegated(
  jiff_instance: JIFFClient,
  secretInput: number
): Promise<number> {
  await jiff_instance.share_array([secretInput], undefined, undefined, [1, 2]);
  const rank = jiff_instance.reshare(undefined, undefined, [1, 2, 3], [1, 2]);
  return await jiff_instance.open(rank);
}

async function benchmarkingProtocolDirect(
  jiff_instance: JIFFClient,
  secretInput: number
): Promise<number> {
  const secrets = await mpc.share_dataset_secrets(
    jiff_instance,
    [secretInput],
    1,
    2
  );

  return await jiff_instance.open(
    mpc.ranking_const(secrets.referenceSecrets[0], secrets.datasetSecrets)
  );
}

async function benchmarkingProtocol(
  jiff_instance: JIFFClient,
  secretInput: number,
  delegated: boolean
): Promise<number> {
  return await (delegated
    ? benchmarkingProtocolDelegated(jiff_instance, secretInput)
    : benchmarkingProtocolDirect(jiff_instance, secretInput));
}

async function datasetBenchmarking(
  sessionId: SessionId,
  secretData: number[],
  delegated = false
): Promise<number[]> {
  return new Promise((resolve) => {
    mpc.connect({
      computationId: sessionId,
      hostname: process.env.COORDINATOR ?? "http://localhost:3000/",
      party_id: delegated ? 3 : 2,
      party_count: delegated ? 3 : 2,
      onConnect: async (jiff_instance: JIFFClient) => {
        const res: number[] = [];
        for (const dimension in secretData) {
          res.push(
            await benchmarkingProtocol(
              jiff_instance,
              secretData[dimension],
              delegated
            )
          );
        }

        jiff_instance.disconnect(true, true);
        resolve(res);
      },
    });
  });
}

type Dataset = DatasetListingApiSuccessResponse["datasets"][0];

export interface BenchmarkingResult {
  results: number[];
  sessionIds: string[];
}

export async function performBenchmarking(
  dataset: Dataset,
  secretData: number[],
  numShards?: number
): Promise<BenchmarkingResult> {
  const delegated = numShards !== undefined;
  const sessions: NewSession[] = Array.from({ length: numShards ?? 1 }).map(
    (_, shardId) => ({
      title: dataset.name,
      numParties: delegated ? 3 : 2,
      input: dataset.dimensions.map((d) => ({
        title: d,
        computation: ComputationKind.RANKING,
        options: numShards
          ? {
              delegated: true,
              numShards,
              shardId,
            }
          : undefined,
      })),
    })
  );

  const sessionIds = await Promise.all(
    sessions.map((s) => newDatasetSession(dataset.id, s))
  );

  const allResults = await Promise.all(
    sessionIds.map((sessionId) =>
      datasetBenchmarking(sessionId, secretData, delegated)
    )
  );

  const result = Array.from({ length: secretData.length }).map(() => 1);

  for (const res of allResults) {
    res.forEach((val, idx) => (result[idx] = result[idx] + val));
  }

  console.log("allResults", allResults);
  console.log("result", result);
  return {
    results: result,
    sessionIds,
  };
}

async function newDatasetSession(datasetId: string, s: NewSession) {
  const res = await ApiNewDatasetSession(datasetId, s);
  if (!res.success) return Promise.reject(res);
  else return Promise.resolve(res.id);
}
