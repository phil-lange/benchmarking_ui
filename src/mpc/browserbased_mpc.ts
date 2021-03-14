import { mpc, SessionId } from "@sine-fdn/sine-ts";

const BROWSER_PARTY_ID = 3;
const NUM_PARTIES = 3;

/**
 * performs the MPC protocol against a single dimension
 * @param jiff_instance low-level MPC connection
 * @param secretInput user-level input vector (to remain secret)
 */
async function benchmarkingProtocol(
  jiff_instance: JIFFClient,
  secretInput: number[]
): Promise<number> {
  await jiff_instance.share_array(secretInput, undefined, undefined, [1, 2]);

  const rank = jiff_instance.reshare(undefined, undefined, [1, 2, 3], [1, 2]);

  return await jiff_instance.open(rank);
}

export async function datasetBenchmarking(
  sessionId: SessionId,
  secretData: number[],
  numDimensions: number
): Promise<number[]> {
  return new Promise((resolve) => {
    mpc.connect({
      computationId: sessionId,
      hostname: process.env.COORDINATOR ?? "http://localhost:3000/",
      party_id: BROWSER_PARTY_ID,
      party_count: NUM_PARTIES,
      onConnect: async (jiff_instance: JIFFClient) => {
        const res: number[] = [];
        for (let dimension = 0; dimension < numDimensions; ++dimension) {
          res.push(await benchmarkingProtocol(jiff_instance, secretData));
        }

        jiff_instance.disconnect(true, true);
        resolve(res);
      },
    });
  });
}
