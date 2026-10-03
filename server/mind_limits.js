'use strict';

// A bounded set of recent creature identities inside an already authorized pond.
// Pond/global budgets still limit callers that rotate identities after expiry.
function reserveCreature(limit, creature, now, cooldownMs, perCreatureBudget=Infinity) {
  const slots=limit.creatures || (limit.creatures=new Map());
  for(const [key,slot] of slots)if(now-slot.at>=120000)slots.delete(key);
  const slot=slots.get(creature);
  if(slot && (now-slot.at<cooldownMs || slot.n>=perCreatureBudget))return false;
  if(!slot && slots.size>=5)return false;
  slots.set(creature,{at:now,n:(slot?.n||0)+1});
  return true;
}
module.exports={reserveCreature};
