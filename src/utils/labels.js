const ASSET_STATUS = {
  0: 'Inactive',
  1: 'Active',
};

const CONDITION = {
  0: 'New',
  1: 'Good',
  2: 'Damaged',
};

const REPAIR_STATUS = {
  0: 'No Repair',
  1: 'In Repair',
  2: 'Discard',
};

function addAssetLabels(row) {
  return {
    ...row,
    statusLabel: ASSET_STATUS[row.status] ?? 'Unknown',
    conditionLabel: row.condition == null ? null : (CONDITION[row.condition] ?? 'Unknown'),
    repairStatusLabel: row.repairStatus == null ? null : (REPAIR_STATUS[row.repairStatus] ?? 'Unknown'),
  };
}

module.exports = { ASSET_STATUS, CONDITION, REPAIR_STATUS, addAssetLabels };
