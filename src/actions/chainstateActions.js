import * as types from './actionTypes';
import steem from 'steem'
import golos from 'golos-classic-js'

export function getAccounts(accounts) {
  return dispatch => {
    dispatch({
      type: types.CHAINSTATE_ACCOUNT_LOAD_PROCESSING
    })
    golos.api.getAccounts(accounts, function(err, data) {
      if(err) {
        dispatch(getAccountsFailed(err))
      } else {
        data.forEach((account) => dispatch(getAccountsResolved(account)))
      }
    })
  }
}

export function getAccountsFailed(payload) {
  return {
    type: types.CHAINSTATE_ACCOUNT_LOAD_FAILED,
    payload: payload
  }
}

export function getAccountsResolved(payload) {
  return {
    type: types.CHAINSTATE_ACCOUNT_LOAD_RESOLVED,
    ts: +new Date,
    payload: payload
  }
}

export function getDynamicGlobalProperties() {
  return dispatch => {
    steem.api.getDynamicGlobalProperties(function(err, data) {
      dispatch(getDynamicGlobalPropertiesResolved(data))
    })
  }
}

export function getDynamicGlobalPropertiesResolved(payload) {
  return {
    type: types.CHAINSTATE_GLOBAL_PROPS_RESOLVED,
    payload
  }
}
