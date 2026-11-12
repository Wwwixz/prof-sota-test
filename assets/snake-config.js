(function(root){
  const config={width:6000,height:6000,maxPlayers:60,tickMs:50,stateMs:100,metadataMs:1000,roundMs:90000,countdownMs:5000,speed:180,turnSpeed:4.5,radius:9,spacing:5,initialLength:24,maxLength:180,growth:3,loss:.35,protectionMs:3000,respawnMs:2000,normalCount:1500,rareCount:100,foodCount:1600,foodRespawnMs:2500,rarePoints:5,points:1,bots:4,inputMs:100,cellSize:200,spawnDistance:450,spawnMargin:250,boundaryMargin:140,viewBase:700,viewGrowth:3,viewMax:1200,viewPadding:180,bodyStride:4,maxBufferedBytes:0,maxDpr:1.5,cameraEase:8,zoomEase:3,rewards:[100,75,50],participationReward:25,resultMs:60000};
  if(typeof module!=='undefined')module.exports=config;else root.SnakeConfig=config;
})(typeof window==='undefined'?globalThis:window);
