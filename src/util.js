const nacl = require('tweetnacl');

const MAP = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function to_b58(term) {return (typeof term === 'string' || term instanceof String) ? to_b58_1(new TextEncoder().encode(term)) : to_b58_1(term)}
function to_b58_1(B,A){if(!A){A=MAP};var d=[],s="",i,j,c,n;for(i in B){j=0,c=B[i];s+=c||s.length^i?"":1;while(j in d||c){n=d[j];n=n?n*256+c:c;c=n/58|0;d[j]=n%58;j++}}while(j--)s+=A[d[j]];return s};
function from_b58(term) {return from_b58_1(term)}
function from_b58_1(S,A){if(!A){A=MAP};var d=[],b=[],i,j,c,n;for(i in S){j=0,c=A.indexOf(S[i]);if(c<0)return undefined;c||b.length^i?i:b.push(0);while(j in d||c){n=d[j];n=n?n*58+c:c;c=n>>8;d[j]=n%256;j++}}while(j--)b.push(d[j]);return new Uint8Array(b)};

function is_string(term) {
  return typeof term === 'string' || term instanceof String
}

function generate_random_keypair() {
  var sign_keypair = nacl.sign.keyPair();
  const pub_b58 = to_b58(sign_keypair.publicKey)
  const sec_b58 = to_b58(sign_keypair.secretKey.slice(0,32))
  return [pub_b58, sec_b58]
}

exports.is_string = is_string
exports.to_b58 = to_b58
exports.from_b58 = from_b58
exports.generate_random_keypair = generate_random_keypair