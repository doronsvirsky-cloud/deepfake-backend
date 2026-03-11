export async function verifyNumberOwnership(
  caller_number: string,
  device_id: string,
  sim_hash: string
) {

  console.log("NUMBER OWNERSHIP CHECK");

  if (!sim_hash) {

    return {
      status: "NUMBER_NOT_VERIFIED"
    };

  }

  return {
    status: "NUMBER_VERIFIED"
  };

}