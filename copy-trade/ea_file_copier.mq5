//+------------------------------------------------------------------+
//| ea_file_copier.mq5                                              |
//| Copies valid local MT5-A position snapshots into this Hedging   |
//| account. It never opens a connection to the source terminal.    |
//+------------------------------------------------------------------+
#property copyright "Local MT5 file copier"
#property version   "1.0"
#property strict

#include <Trade/Trade.mqh>

input string InpSignalFile          = "MT5CopyTrade\\mt5-copy-snapshot.json";
input long   InpExpectedSourceAccount = 0; // Required: MT5-A login number
input string InpSymbolMappings      = "XAUUSD.n=XAUUSD;EURUSD=EURUSD";
input long   InpMagicNumber         = 26080601;
input double InpLotMultiplier       = 1.00;
input double InpMaxSingleLot         = 1.00;
input double InpMaxTotalLots         = 3.00;
input int    InpPollMilliseconds     = 1000;
input int    InpSnapshotTimeoutSec   = 10;
input int    InpMaxRetries           = 3;
input int    InpRetryDelayMs         = 500;
input bool   InpCopyStops            = true;
input bool   InpRejectInvalidStops   = true;
// 0 = only write journal (safe first run), 1 = full copy, 2 = only close stale copied positions.
input int    InpTradingMode           = 0;

#define SNAPSHOT_SCHEMA "mt5-copy-snapshot/v1"
#define COMMENT_PREFIX  "MT5CPY:"

struct SourcePosition
  {
   string source_id;
   string symbol;
   ENUM_POSITION_TYPE side;
   double volume;
   double sl;
   double tp;
  };

CTrade g_trade;
long   g_last_sequence=0;

//+------------------------------------------------------------------+
string Trim(string value)
  {
   StringTrimLeft(value);
   StringTrimRight(value);
   return value;
  }
//+------------------------------------------------------------------+
bool JsonLocateValue(const string json,const string key,int &value_start)
  {
   string needle="\""+key+"\"";
   int key_at=StringFind(json,needle);
   if(key_at<0)
      return false;
   int colon=key_at+StringLen(needle);
   int length=StringLen(json);
   while(colon<length && StringGetCharacter(json,colon)!=':')
      colon++;
   if(colon>=length)
      return false;
   value_start=colon+1;
   while(value_start<length)
     {
      ushort character=(ushort)StringGetCharacter(json,value_start);
      if(character!=' ' && character!='\t' && character!='\r' && character!='\n')
         break;
      value_start++;
     }
   return value_start<length;
  }
//+------------------------------------------------------------------+
bool JsonGetRaw(const string json,const string key,string &value)
  {
   int start=0;
   if(!JsonLocateValue(json,key,start))
      return false;
   int length=StringLen(json);
   int finish=start;
   bool quoted=(StringGetCharacter(json,start)=='\"');
   if(quoted)
     {
      finish++;
      bool escaped=false;
      while(finish<length)
        {
         ushort character=(ushort)StringGetCharacter(json,finish);
         if(character=='\"' && !escaped)
           {
            value=StringSubstr(json,start+1,finish-start-1);
            return true;
           }
         if(character=='\\' && !escaped)
            escaped=true;
         else
            escaped=false;
         finish++;
        }
      return false;
     }
   while(finish<length)
     {
      ushort character=(ushort)StringGetCharacter(json,finish);
      if(character==',' || character=='}' || character==']' || character=='\r' || character=='\n')
         break;
      finish++;
     }
   value=Trim(StringSubstr(json,start,finish-start));
   return StringLen(value)>0;
  }
//+------------------------------------------------------------------+
bool JsonGetString(const string json,const string key,string &value)
  {
   int start=0;
   if(!JsonLocateValue(json,key,start) || StringGetCharacter(json,start)!='\"')
      return false;
   return JsonGetRaw(json,key,value);
  }
//+------------------------------------------------------------------+
bool JsonGetLong(const string json,const string key,long &value)
  {
   string raw="";
   if(!JsonGetRaw(json,key,raw))
      return false;
   value=(long)StringToInteger(raw);
   return true;
  }
//+------------------------------------------------------------------+
bool JsonGetDouble(const string json,const string key,double &value)
  {
   string raw="";
   if(!JsonGetRaw(json,key,raw))
      return false;
   value=StringToDouble(raw);
   return true;
  }
//+------------------------------------------------------------------+
bool JsonGetBoolean(const string json,const string key,bool &value)
  {
   string raw="";
   if(!JsonGetRaw(json,key,raw))
      return false;
  raw=Trim(raw);
  StringToLower(raw);
   if(raw=="true")
     {
      value=true;
      return true;
     }
   if(raw=="false")
     {
      value=false;
      return true;
     }
   return false;
  }
//+------------------------------------------------------------------+
bool ExtractPositionObjects(const string json,string &objects[])
  {
   int start=0;
   if(!JsonLocateValue(json,"positions",start) || StringGetCharacter(json,start)!='[')
      return false;
   int length=StringLen(json);
   int depth=0;
   int object_start=-1;
   bool quoted=false;
   bool escaped=false;
   int count=0;
   ArrayResize(objects,0);
   for(int index=start+1;index<length;index++)
     {
      ushort character=(ushort)StringGetCharacter(json,index);
      if(quoted)
        {
         if(character=='\"' && !escaped)
            quoted=false;
         if(character=='\\' && !escaped)
            escaped=true;
         else
            escaped=false;
         continue;
        }
      if(character=='\"')
        {
         quoted=true;
         continue;
        }
      if(character=='{')
        {
         if(depth==0)
            object_start=index;
         depth++;
         continue;
        }
      if(character=='}')
        {
         depth--;
         if(depth<0)
            return false;
         if(depth==0 && object_start>=0)
           {
            ArrayResize(objects,count+1);
            objects[count++]=StringSubstr(json,object_start,index-object_start+1);
            object_start=-1;
           }
         continue;
        }
      if(character==']' && depth==0)
         return true;
     }
   return false;
  }
//+------------------------------------------------------------------+
bool ParseSourcePosition(const string object,SourcePosition &position)
  {
   string side="";
   if(!JsonGetString(object,"source_id",position.source_id) || !JsonGetString(object,"symbol",position.symbol) ||
      !JsonGetString(object,"side",side) || !JsonGetDouble(object,"volume",position.volume) ||
      !JsonGetDouble(object,"sl",position.sl) || !JsonGetDouble(object,"tp",position.tp))
      return false;
   if(position.source_id=="" || position.symbol=="" || position.volume<=0.0)
      return false;
   if(side=="BUY")
      position.side=POSITION_TYPE_BUY;
   else if(side=="SELL")
      position.side=POSITION_TYPE_SELL;
   else
      return false;
   return true;
  }
//+------------------------------------------------------------------+
bool SnapshotInvalid(string &reason,const string message)
  {
  reason=message;
  return false;
  }
//+------------------------------------------------------------------+
bool ParseSnapshot(const string json,const long file_modified_at_ms,SourcePosition &positions[],long &sequence,long &source_account,string &reason)
  {
   string schema="";
   bool complete=false;
   long generated_at=0;
   long expires_at=0;
   long position_count=0;
  if(!JsonGetString(json,"schema",schema) || schema!=SNAPSHOT_SCHEMA)
    return SnapshotInvalid(reason,"schema 缺失或版本不匹配");
  if(!JsonGetBoolean(json,"snapshot_complete",complete) || !complete)
    return SnapshotInvalid(reason,"snapshot_complete 不是 true");
  if(!JsonGetLong(json,"sequence",sequence) || sequence<=0)
    return SnapshotInvalid(reason,"sequence 缺失或无效");
  if(!JsonGetLong(json,"source_account",source_account))
    return SnapshotInvalid(reason,"source_account 缺失或无效");
  if(!JsonGetLong(json,"generated_at_unix_ms",generated_at) || !JsonGetLong(json,"expires_at_unix_ms",expires_at))
    return SnapshotInvalid(reason,"快照时间字段缺失或无效");
  if(!JsonGetLong(json,"position_count",position_count) || position_count<0)
    return SnapshotInvalid(reason,"position_count 缺失或无效");

   long now_ms=(long)TimeLocal()*1000;
  if(generated_at<=0 || expires_at<=generated_at)
    return SnapshotInvalid(reason,"快照时间范围无效");
  if(file_modified_at_ms<=0)
    return SnapshotInvalid(reason,"无法读取信号文件的最后修改时间");
  long file_age_ms=now_ms-file_modified_at_ms;
  if(file_age_ms>(long)InpSnapshotTimeoutSec*1000)
    return SnapshotInvalid(reason,StringFormat("信号文件超过 InpSnapshotTimeoutSec（文件年龄=%I64dms，限制=%dms，终端时间=%I64d，文件时间=%I64d，Python时间=%I64d）",file_age_ms,InpSnapshotTimeoutSec*1000,now_ms,file_modified_at_ms,generated_at));
  if(file_age_ms<-(long)InpSnapshotTimeoutSec*1000)
    return SnapshotInvalid(reason,StringFormat("信号文件时间晚于终端时间过多（偏差=%I64dms）",-file_age_ms));
  if(expires_at-generated_at>(long)(InpSnapshotTimeoutSec+5)*1000)
    return SnapshotInvalid(reason,"快照有效期异常长");
   if(InpExpectedSourceAccount<=0 || source_account!=InpExpectedSourceAccount)
    return SnapshotInvalid(reason,"source_account 与 InpExpectedSourceAccount 不匹配");
   if(sequence<g_last_sequence)
    return SnapshotInvalid(reason,"sequence 比已处理快照更旧");

   string objects[];
   if(!ExtractPositionObjects(json,objects))
    return SnapshotInvalid(reason,"positions 数组缺失或格式无效");
  if(position_count!=ArraySize(objects))
    return SnapshotInvalid(reason,"position_count 与 positions 数量不一致");
   ArrayResize(positions,0);
   for(int index=0;index<ArraySize(objects);index++)
     {
      SourcePosition parsed;
      if(!ParseSourcePosition(objects[index],parsed))
        return SnapshotInvalid(reason,"positions 中存在字段缺失或无效的持仓");
      for(int previous=0;previous<index;previous++)
         if(positions[previous].source_id==parsed.source_id)
          return SnapshotInvalid(reason,"positions 中存在重复 source_id");
      ArrayResize(positions,index+1);
      positions[index]=parsed;
     }
    if(sequence>g_last_sequence)
      g_last_sequence=sequence;
   return true;
  }
//+------------------------------------------------------------------+
bool ReadSignalFile(string &json,long &file_modified_at_ms)
  {
   ResetLastError();
   int handle=FileOpen(InpSignalFile,FILE_READ|FILE_BIN|FILE_COMMON|FILE_SHARE_READ|FILE_SHARE_WRITE);
   if(handle==INVALID_HANDLE)
     {
      PrintFormat("[Copy] 无法读取信号文件 '%s'，错误=%d",InpSignalFile,GetLastError());
      return false;
     }
    long modified_at=(long)FileGetInteger(handle,FILE_MODIFY_DATE);
    file_modified_at_ms=modified_at*1000;
    ulong size=FileSize(handle);
   if(size<=0 || size>1024*1024)
     {
      FileClose(handle);
      Print("[Copy] 信号文件为空或超过 1 MB，已拒绝");
      return false;
     }
   char bytes[];
   ArrayResize(bytes,(int)size);
  uint read=FileReadArray(handle,bytes,0,(int)size);
   FileClose(handle);
  if(read!=(uint)size)
     {
    PrintFormat("[Copy] 信号文件读取不完整，期望=%d，实际=%d",(int)size,(int)read);
      return false;
     }
  json=CharArrayToString(bytes,0,(int)read,CP_UTF8);
   return StringLen(json)>0;
  }
//+------------------------------------------------------------------+
string TargetSymbolFor(const string source_symbol)
  {
   string mappings[];
   int mapping_count=StringSplit(InpSymbolMappings,';',mappings);
   for(int index=0;index<mapping_count;index++)
     {
      string pair[];
      if(StringSplit(mappings[index],'=',pair)!=2)
         continue;
      if(Trim(pair[0])==source_symbol)
         return Trim(pair[1]);
     }
   return "";
  }
//+------------------------------------------------------------------+
double NormalizeVolume(const string symbol,const double requested)
  {
   double minimum=SymbolInfoDouble(symbol,SYMBOL_VOLUME_MIN);
   double maximum=SymbolInfoDouble(symbol,SYMBOL_VOLUME_MAX);
   double step=SymbolInfoDouble(symbol,SYMBOL_VOLUME_STEP);
   if(minimum<=0.0 || maximum<=0.0 || step<=0.0 || requested<minimum)
      return 0.0;
  double capped=MathMin(requested,maximum);
   double normalized=MathFloor((capped+1e-10)/step)*step;
  return NormalizeDouble(normalized,8);
  }
//+------------------------------------------------------------------+
string SourceComment(const string source_id)
  {
   return COMMENT_PREFIX+source_id;
  }
//+------------------------------------------------------------------+
bool IsCopiedPositionForSource(const string source_id)
  {
   return PositionGetInteger(POSITION_MAGIC)==InpMagicNumber && PositionGetString(POSITION_COMMENT)==SourceComment(source_id);
  }
//+------------------------------------------------------------------+
double CopiedVolumeForSource(const string source_id)
  {
   double total=0.0;
   for(int index=PositionsTotal()-1;index>=0;index--)
     {
      ulong ticket=PositionGetTicket(index);
      if(ticket>0 && IsCopiedPositionForSource(source_id))
         total+=PositionGetDouble(POSITION_VOLUME);
     }
   return total;
  }
//+------------------------------------------------------------------+
bool SourceExists(const string source_id,const SourcePosition &positions[])
  {
   for(int index=0;index<ArraySize(positions);index++)
      if(positions[index].source_id==source_id)
         return true;
   return false;
  }
//+------------------------------------------------------------------+
bool IsSuccessfulTradeResult(void)
  {
   uint code=g_trade.ResultRetcode();
   return code==TRADE_RETCODE_DONE || code==TRADE_RETCODE_DONE_PARTIAL || code==TRADE_RETCODE_PLACED;
  }
//+------------------------------------------------------------------+
void LogTradeFailure(const string action,const int attempt)
  {
   PrintFormat("[Copy] %s 失败（第 %d/%d 次）：retcode=%u，%s",action,attempt,InpMaxRetries,g_trade.ResultRetcode(),g_trade.ResultRetcodeDescription());
  }
//+------------------------------------------------------------------+
bool OpenCopiedPosition(const SourcePosition &source,const string target_symbol,const double volume)
  {
   if(InpTradingMode!=1)
     {
      PrintFormat("[Copy] 观察模式：将开 %s %.2f -> %s",source.side==POSITION_TYPE_BUY?"BUY":"SELL",volume,target_symbol);
      return false;
     }
   if(!SymbolSelect(target_symbol,true))
     {
      PrintFormat("[Copy] 品种不可用，无法开仓：%s",target_symbol);
      return false;
     }
   if(InpCopyStops && InpRejectInvalidStops && !StopsAreValid(target_symbol,source.side,source.sl,source.tp))
     {
      PrintFormat("[Copy] 源端 SL/TP 不符合目标品种规则，拒绝开仓：%s",target_symbol);
      return false;
     }
   for(int attempt=1;attempt<=InpMaxRetries;attempt++)
     {
      bool sent=(source.side==POSITION_TYPE_BUY)
                ? g_trade.Buy(volume,target_symbol,0.0,InpCopyStops?source.sl:0.0,InpCopyStops?source.tp:0.0,SourceComment(source.source_id))
                : g_trade.Sell(volume,target_symbol,0.0,InpCopyStops?source.sl:0.0,InpCopyStops?source.tp:0.0,SourceComment(source.source_id));
      if(sent && IsSuccessfulTradeResult())
         return true;
      LogTradeFailure("开仓 "+target_symbol,attempt);
      if(attempt<InpMaxRetries)
         Sleep(InpRetryDelayMs);
     }
   return false;
  }
//+------------------------------------------------------------------+
bool CloseCopiedTicket(const ulong ticket,const string reason)
  {
   if(InpTradingMode==0)
     {
      PrintFormat("[Copy] 观察模式：将平仓 ticket=%I64u（%s）",ticket,reason);
      return false;
     }
   for(int attempt=1;attempt<=InpMaxRetries;attempt++)
     {
      if(g_trade.PositionClose(ticket) && IsSuccessfulTradeResult())
         return true;
      LogTradeFailure("平仓 "+(string)ticket,attempt);
      if(attempt<InpMaxRetries)
         Sleep(InpRetryDelayMs);
     }
   return false;
  }
//+------------------------------------------------------------------+
bool ReduceCopiedVolume(const string source_id,double amount)
  {
   for(int index=PositionsTotal()-1;index>=0 && amount>0.0;index--)
     {
      ulong ticket=PositionGetTicket(index);
      if(ticket==0 || !IsCopiedPositionForSource(source_id))
         continue;
      double current=PositionGetDouble(POSITION_VOLUME);
      string symbol=PositionGetString(POSITION_SYMBOL);
      double step=SymbolInfoDouble(symbol,SYMBOL_VOLUME_STEP);
      double minimum=SymbolInfoDouble(symbol,SYMBOL_VOLUME_MIN);
      double close_volume=MathMin(current,amount);
      close_volume=MathFloor((close_volume+1e-10)/step)*step;
      if(close_volume<=0.0)
         continue;
      if(InpTradingMode==0)
        {
         PrintFormat("[Copy] 观察模式：将减仓 ticket=%I64u %.2f",ticket,close_volume);
         return false;
        }
      bool closed=false;
      for(int attempt=1;attempt<=InpMaxRetries;attempt++)
        {
         bool sent=(close_volume>=current-minimum/2.0) ? g_trade.PositionClose(ticket) : g_trade.PositionClosePartial(ticket,close_volume);
         if(sent && IsSuccessfulTradeResult())
           {
            closed=true;
            break;
           }
         LogTradeFailure("减仓 "+(string)ticket,attempt);
         if(attempt<InpMaxRetries)
            Sleep(InpRetryDelayMs);
        }
      if(!closed)
         return false;
      amount-=close_volume;
     }
   return amount<=0.0000001;
  }
//+------------------------------------------------------------------+
bool StopsAreValid(const string symbol,const ENUM_POSITION_TYPE side,const double sl,const double tp)
  {
   if(sl==0.0 && tp==0.0)
      return true;
   MqlTick tick;
   if(!SymbolInfoTick(symbol,tick))
      return false;
   double point=SymbolInfoDouble(symbol,SYMBOL_POINT);
   int stops_level=(int)SymbolInfoInteger(symbol,SYMBOL_TRADE_STOPS_LEVEL);
   double distance=point*stops_level;
   if(side==POSITION_TYPE_BUY)
     {
      if(sl>0.0 && sl>tick.bid-distance)
         return false;
      if(tp>0.0 && tp<tick.bid+distance)
         return false;
     }
   else
     {
      if(sl>0.0 && sl<tick.ask+distance)
         return false;
      if(tp>0.0 && tp>tick.ask-distance)
         return false;
     }
   return true;
  }
//+------------------------------------------------------------------+
void UpdateCopiedStops(const string source_id,const string symbol,const ENUM_POSITION_TYPE side,const double sl,const double tp)
  {
   if(!InpCopyStops || InpTradingMode!=1)
      return;
   if(InpRejectInvalidStops && !StopsAreValid(symbol,side,sl,tp))
     {
      PrintFormat("[Copy] 源端 SL/TP 不符合目标品种规则，跳过修改：%s",symbol);
      return;
     }
   for(int index=PositionsTotal()-1;index>=0;index--)
     {
      ulong ticket=PositionGetTicket(index);
      if(ticket==0 || !IsCopiedPositionForSource(source_id))
         continue;
      double current_sl=PositionGetDouble(POSITION_SL);
      double current_tp=PositionGetDouble(POSITION_TP);
      if(MathAbs(current_sl-sl)<0.000000001 && MathAbs(current_tp-tp)<0.000000001)
         continue;
      bool changed=false;
      for(int attempt=1;attempt<=InpMaxRetries;attempt++)
        {
         if(g_trade.PositionModify(ticket,sl,tp) && IsSuccessfulTradeResult())
           {
            changed=true;
            break;
           }
         LogTradeFailure("修改 SL/TP "+(string)ticket,attempt);
         if(attempt<InpMaxRetries)
            Sleep(InpRetryDelayMs);
        }
      if(!changed)
         PrintFormat("[Copy] ticket=%I64u 的 SL/TP 更新将于下一轮重试",ticket);
     }
  }
//+------------------------------------------------------------------+
bool DesiredVolumeIsWithinLimits(const SourcePosition &positions[])
  {
   double total=0.0;
   for(int index=0;index<ArraySize(positions);index++)
     {
      string target=TargetSymbolFor(positions[index].symbol);
      if(target=="")
         continue;
      if(!SymbolSelect(target,true))
        {
         PrintFormat("[Copy] 未选择或不存在目标品种：%s -> %s",positions[index].symbol,target);
         return false;
        }
      double requested=positions[index].volume*InpLotMultiplier;
      double maximum=SymbolInfoDouble(target,SYMBOL_VOLUME_MAX);
      if(requested>InpMaxSingleLot+0.0000001 || requested>maximum+0.0000001)
        {
         PrintFormat("[Copy] 单笔目标手数 %.2f 超过上限（配置=%.2f，品种=%.2f），整份快照不执行",requested,InpMaxSingleLot,maximum);
         return false;
        }
      double desired=NormalizeVolume(target,requested);
      if(desired<=0.0)
        {
         PrintFormat("[Copy] 手数无法按目标规格规范化：%s，源手数=%.2f",target,positions[index].volume);
         return false;
        }
      total+=desired;
     }
   if(total>InpMaxTotalLots+0.0000001)
     {
      PrintFormat("[Copy] 目标总手数 %.2f 超过限制 %.2f，整份快照不执行",total,InpMaxTotalLots);
      return false;
     }
   return true;
  }
//+------------------------------------------------------------------+
void CloseStaleCopiedPositions(const SourcePosition &positions[])
  {
   for(int index=PositionsTotal()-1;index>=0;index--)
     {
      ulong ticket=PositionGetTicket(index);
      if(ticket==0 || PositionGetInteger(POSITION_MAGIC)!=InpMagicNumber)
         continue;
      string comment=PositionGetString(POSITION_COMMENT);
      if(StringFind(comment,COMMENT_PREFIX)!=0)
         continue;
      string source_id=StringSubstr(comment,StringLen(COMMENT_PREFIX));
      if(!SourceExists(source_id,positions))
         CloseCopiedTicket(ticket,"源端持仓已不存在");
     }
  }
//+------------------------------------------------------------------+
void Synchronize(const SourcePosition &positions[])
  {
  if(InpTradingMode!=2 && !DesiredVolumeIsWithinLimits(positions))
      return;

   CloseStaleCopiedPositions(positions);
   if(InpTradingMode==2)
      return;

   for(int index=0;index<ArraySize(positions);index++)
     {
      SourcePosition source=positions[index];
      string target=TargetSymbolFor(source.symbol);
      if(target=="")
        {
         PrintFormat("[Copy] 未配置品种映射，忽略：%s",source.symbol);
         continue;
        }
      double desired=NormalizeVolume(target,source.volume*InpLotMultiplier);
      if(desired<=0.0)
         continue;
      double existing=CopiedVolumeForSource(source.source_id);
      double step=SymbolInfoDouble(target,SYMBOL_VOLUME_STEP);
      if(existing+step/2.0<desired)
         OpenCopiedPosition(source,target,NormalizeVolume(target,desired-existing));
      else if(existing>desired+step/2.0)
         ReduceCopiedVolume(source.source_id,existing-desired);
      UpdateCopiedStops(source.source_id,target,source.side,source.sl,source.tp);
     }
  }
//+------------------------------------------------------------------+
int OnInit()
  {
   if(InpExpectedSourceAccount<=0 || InpMagicNumber<=0 || InpLotMultiplier<=0.0 || InpMaxSingleLot<=0.0 ||
      InpMaxTotalLots<=0.0 || InpMaxSingleLot>InpMaxTotalLots || InpPollMilliseconds<250 ||
      InpSnapshotTimeoutSec<2 || InpMaxRetries<1 || InpRetryDelayMs<0 || InpTradingMode<0 || InpTradingMode>2)
     {
      Print("[Copy] 输入参数无效，EA 未启动");
      return INIT_PARAMETERS_INCORRECT;
     }
   g_trade.SetExpertMagicNumber(InpMagicNumber);
   g_trade.SetAsyncMode(false);
   EventSetMillisecondTimer(InpPollMilliseconds);
   PrintFormat("[Copy] 已启动；模式=%d，读取 Common\\Files\\%s",InpTradingMode,InpSignalFile);
   return INIT_SUCCEEDED;
  }
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
  {
   EventKillTimer();
  }
//+------------------------------------------------------------------+
void OnTimer()
  {
   string json="";
  long file_modified_at_ms=0;
  if(!ReadSignalFile(json,file_modified_at_ms))
      return;
   SourcePosition positions[];
   long sequence=0;
   long source_account=0;
  string snapshot_reason="";
  if(!ParseSnapshot(json,file_modified_at_ms,positions,sequence,source_account,snapshot_reason))
     {
    PrintFormat("[Copy] 快照无效：%s；保持现有跟单仓位",snapshot_reason);
      return;
     }
   Synchronize(positions);
  }
//+------------------------------------------------------------------+
